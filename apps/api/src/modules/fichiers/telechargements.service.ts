import type { Readable } from 'node:stream';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Permission } from '@scolaly/contracts';
import {
  authUser,
  cleMaitresseCourante,
  enregistrerAudit,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from '../../access/access-resolver.js';
import { doubleAuthentificationRequise } from '../../access/access.guard.js';
import type { Env } from '../../config/env.js';
import { JetonChiffre } from '../../shared/jeton-chiffre.js';
import { ObjectStorage, SIGNED_URL_TTL_SECONDS } from '../../shared/storage/object-storage.js';
import { DATABASE, ENV, OBJECT_STORAGE } from '../../shared/tokens.js';

export const ROUTE_TELECHARGEMENT = '/api/fichiers/telechargement';

/** Durée de validité la plus longue d'une adresse de téléchargement (lien d'export envoyé par email). */
export const DUREE_TELECHARGEMENT_MAX_SECONDES = 24 * 3600;

export interface FichierATelecharger {
  /** Clé de l'objet, sous `organisations/<id>/`. */
  cle: string;
  /** Nom proposé au navigateur. */
  nom: string;
  /** Type MIME envoyé avec le fichier. */
  type: 'application/pdf' | 'text/csv; charset=utf-8';
  /** Objet métier du fichier, inscrit au journal d'audit à chaque téléchargement. */
  objet: { type: string; id: string };
}

export interface FichierOuvert {
  flux: Readable;
  taille: number | undefined;
  nom: string;
  type: string;
}

const introuvable = () =>
  new NotFoundException(
    'Fichier introuvable ou adresse expirée : relancez le téléchargement depuis Scolaly.',
  );

/**
 * Téléchargement des fichiers privés par l'API (ADR 0007) : le stockage S3 (Garage, Ceph) n'est
 * jamais exposé au navigateur. L'adresse est donnée après contrôle des droits, pour le seul compte
 * qui la demande ; à chaque téléchargement, la session, l'école et la permission sont revérifiées.
 */
@Injectable()
export class TelechargementsService {
  private readonly jetons: JetonChiffre;
  private readonly logger = new Logger('Telechargements');

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
  ) {
    this.jetons = new JetonChiffre(cleMaitresseCourante(env.chiffrement), 'telechargements');
  }

  /**
   * Adresse relative de téléchargement, valable quelques minutes. `permissions` : l'une d'elles
   * doit encore être détenue au moment du téléchargement.
   */
  adresse(
    access: Access,
    fichier: FichierATelecharger,
    options: { permissions: readonly Permission[]; dureeSecondes?: number },
  ): string {
    const duree = options.dureeSecondes ?? SIGNED_URL_TTL_SECONDS;
    if (duree <= 0 || duree > DUREE_TELECHARGEMENT_MAX_SECONDES)
      throw new Error(`Durée de téléchargement invalide : ${duree} s`);
    if (!fichier.cle.startsWith(`organisations/${access.organisationId}/`))
      throw new Error('Le fichier n’appartient pas à l’école de la session.');
    const jeton = this.jetons.emettre(
      {
        c: fichier.cle,
        n: fichier.nom,
        t: fichier.type,
        u: access.userId,
        o: access.organisationId,
        p: options.permissions,
        ot: fichier.objet.type,
        oi: fichier.objet.id,
      },
      Date.now() + duree * 1000,
    );
    return `${ROUTE_TELECHARGEMENT}?jeton=${jeton}`;
  }

  /** Adresse complète, pour un email. */
  adresseAbsolue(...parametres: Parameters<TelechargementsService['adresse']>): string {
    return new URL(this.adresse(...parametres), this.env.PUBLIC_URL).toString();
  }

  /**
   * Ouvre le fichier et inscrit le téléchargement au journal d'audit (qui, quand, quel objet, adresse
   * IP ; jamais le jeton ni le contenu). Sans trace écrite, le fichier n'est pas remis.
   */
  async ouvrir(
    jeton: string,
    userId: string | undefined,
    adresseIp: string | undefined,
  ): Promise<FichierOuvert> {
    const charge = this.jetons.lire(jeton);
    const {
      c: cle,
      n: nom,
      t: type,
      u,
      o: organisationId,
      p: permissions,
      ot: objetType,
      oi: objetId,
    } = charge ?? {};
    if (
      !userId ||
      u !== userId ||
      typeof cle !== 'string' ||
      typeof nom !== 'string' ||
      typeof type !== 'string' ||
      typeof organisationId !== 'string' ||
      !Array.isArray(permissions) ||
      !cle.startsWith(`organisations/${organisationId}/`)
    )
      throw introuvable();

    // Droits revérifiés : un compte désactivé ou un rôle retiré n'a plus accès au fichier.
    const access = await this.resolver.resolve(userId, organisationId);
    if (!access || !permissions.some((p) => access.permissions.has(p as Permission)))
      throw new ForbiddenException(
        "Vous n'avez plus le droit de télécharger ce fichier dans cette école. " +
          'Demandez à un administrateur de vous attribuer le rôle adapté.',
      );
    if (access.acces === 'ferme')
      throw new ForbiddenException(
        "L'accès de votre établissement à Scolaly est fermé. Contactez la direction de votre établissement.",
      );
    if (access.doubleAuthentificationExigee) {
      const [compte] = await this.db
        .select({ actif: authUser.twoFactorEnabled })
        .from(authUser)
        .where(eq(authUser.id, userId));
      if (!compte?.actif) throw doubleAuthentificationRequise();
    }

    const objet = await this.storage.lireFlux(cle);
    if (!objet) throw introuvable();
    try {
      await withOrganisation(this.db, organisationId, (tx) =>
        enregistrerAudit(tx, {
          action: 'telechargement.fichier',
          // Adresses données avant le suivi des téléchargements : objet inconnu, trace quand même.
          objetType: typeof objetType === 'string' ? objetType : 'fichier',
          objetId: typeof objetId === 'string' ? objetId : null,
          auteurId: userId,
          adresseIp: adresseIp ?? null,
          apres: { type },
        }),
      );
    } catch (erreur) {
      objet.flux.destroy();
      // Le message d'erreur SQL reprend les valeurs insérées (compte, IP) : seul son type est noté.
      this.logger.error(
        `Téléchargement refusé, trace d'audit impossible (${erreur instanceof Error ? erreur.name : 'erreur inconnue'})`,
      );
      throw new ServiceUnavailableException(
        'Le téléchargement n’a pas pu être enregistré au journal : il est refusé par sécurité. ' +
          'Réessayez dans quelques minutes, puis prévenez l’administrateur si cela persiste.',
      );
    }
    return { ...objet, nom, type };
  }
}
