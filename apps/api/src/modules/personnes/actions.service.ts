import { createHash } from 'node:crypto';
import { ForbiddenException, HttpException, Inject, Injectable } from '@nestjs/common';
import {
  emailExportPret,
  type ActionsPersonnes,
  type RecherchePersonnes,
  type ResultatActions,
} from '@scolaly/contracts';
import {
  authUser,
  enregistrerAudit,
  newId,
  organisation,
  personne,
  type Transaction,
} from '@scolaly/db';
import { eq, inArray } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { RequestContext } from '../../access/request-context.js';
import type { EmailsQueue } from '../../shared/emails.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { EMAILS, OBJECT_STORAGE } from '../../shared/tokens.js';
import { ComptesService, InvitationsService } from '../comptes/index.js';
import { PersonnesService } from './personnes.service.js';

/** RG-01-21 : au-delà de 100 personnes, l'export est envoyé par un lien valable 24 h. */
const EXPORT_DIRECT_MAX = 100;
const LIEN_EXPORT_SECONDES = 24 * 3600;

/** Actions en masse et export de la liste des personnes (E-01-04 ; US-01-06, RG-01-21). */
@Injectable()
export class ActionsService {
  constructor(
    private readonly personnes: PersonnesService,
    private readonly invitations: InvitationsService,
    private readonly comptes: ComptesService,
    @Inject(EMAILS) private readonly emails: EmailsQueue,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Chaque personne est traitée à part (point de sauvegarde) : un refus, par exemple un compte
   * déjà actif ou le dernier administrateur, n'empêche pas les autres.
   */
  async executer(
    tx: Transaction,
    access: Access,
    { action, personneIds }: ActionsPersonnes,
    adresseIp: string,
  ): Promise<ResultatActions> {
    const peut =
      action === 'inviter'
        ? access.permissions.has('apprenants:inviter') ||
          access.permissions.has('personnel:inviter')
        : access.permissions.has('comptes:desactiver');
    if (!peut) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit d'effectuer cette action dans cette école. Demandez à un administrateur de vous attribuer le rôle adapté.",
      );
    }
    const ids = [...new Set(personneIds)];
    const noms = new Map(
      (
        await tx
          .select({ id: personne.id, nom: personne.nom, prenom: personne.prenom })
          .from(personne)
          .where(inArray(personne.id, ids))
      ).map((p) => [p.id, `${p.prenom} ${p.nom}`]),
    );
    const echecs: ResultatActions['echecs'] = [];
    let reussies = 0;
    for (const id of ids) {
      try {
        await tx.transaction(async (sp) => {
          if (action === 'inviter') {
            const { envoyer } = await this.invitations.inviter(sp, access.organisationId, id, {
              userId: access.userId,
              adresseIp,
            });
            RequestContext.apresValidation(envoyer);
          } else if (action === 'desactiver') {
            await this.comptes.desactiver(sp, access, id, adresseIp);
          } else {
            await this.comptes.reactiver(sp, access, id, adresseIp);
          }
        });
        reussies++;
      } catch (erreur) {
        if (!(erreur instanceof HttpException)) throw erreur;
        const reponse = erreur.getResponse();
        echecs.push({
          personneId: id,
          nom: noms.get(id) ?? id,
          message:
            typeof reponse === 'object' &&
            'message' in reponse &&
            typeof reponse.message === 'string'
              ? reponse.message
              : erreur.message,
        });
      }
    }
    return { reussies, echecs };
  }

  /**
   * RG-01-21 : export du périmètre, tracé ; jusqu'à 100 personnes le fichier est téléchargé tout de
   * suite, au-delà il est déposé dans le stockage et un lien valable 24 h est envoyé par email.
   */
  async exporter(
    tx: Transaction,
    access: Access,
    recherche: Pick<RecherchePersonnes, 'q' | 'etat' | 'role'>,
    adresseIp: string,
  ): Promise<{ total: number; contenu: string } | { total: number; envoye: true }> {
    const { total, contenu } = await this.personnes.exporter(tx, access, recherche);
    await enregistrerAudit(tx, {
      action: 'personnes.exporter',
      objetType: 'personne',
      auteurId: access.userId,
      adresseIp,
      apres: { total, filtres: recherche },
    });
    if (total <= EXPORT_DIRECT_MAX) return { total, contenu };

    const fichier = Buffer.from(contenu, 'utf8');
    const key = ObjectStorage.key(access.organisationId, 'exports', newId());
    await this.storage.put(
      key,
      fichier,
      'text/csv',
      createHash('sha256').update(fichier).digest('hex'),
    );
    const lien = await this.storage.signedDownloadUrl(key, {
      filename: 'personnes.csv',
      ttlSeconds: LIEN_EXPORT_SECONDES,
    });
    const [compte] = await tx
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, access.userId));
    const [ecole] = await tx
      .select({ nom: organisation.nom })
      .from(organisation)
      .where(eq(organisation.id, access.organisationId));
    if (compte) {
      const job = emailExportPret({ to: compte.email, ecole: ecole?.nom ?? '', lien, total });
      RequestContext.apresValidation(() => this.emails.envoyer(job));
    }
    return { total, envoye: true };
  }
}
