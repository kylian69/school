import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FluxIcal } from '@scolaly/contracts';
import {
  enregistrerAudit,
  etablissement,
  fluxIcal,
  lireJeton,
  nouveauJeton,
  organisation,
  personne,
  promotion,
  salle,
  seance,
  seanceAttenduCalcule,
  seancePublic,
  seanceIntervenant,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { ecrireFluxIcal, fenetreFluxIcal, type EvenementFluxIcal } from '@scolaly/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import type { Env } from '../../config/env.js';
import { FieldEncryption, FieldEncryptionError } from '../../shared/crypto/field-encryption.js';
import { DATABASE, ENV, FIELD_ENCRYPTION } from '../../shared/tokens.js';

/** Au-delà, le flux est tronqué (une personne a rarement plus de 30 séances par semaine). */
const SEANCES_MAX = 2_000;
const FUSEAU_PAR_DEFAUT = 'Europe/Paris';

export interface FluxIcalGenere {
  contenu: string;
  etag: string;
}

const INACTIF: FluxIcal = { actif: false, regenereLe: null, url: null, regenerationRequise: false };

/** Données associées du chiffrement : le jeton n'est lisible que sur la ligne de sa personne. */
const contexteJeton = (personneId: string) => `flux_ical.jeton:${personneId}`;

/**
 * RG-04-15 : flux iCal personnel. Le jeton porte l'identifiant de l'école (transaction RLS) et un
 * secret. La lecture publique cherche par l'empreinte du secret, sans rien déchiffrer ; le jeton
 * est conservé chiffré par champ (ADR 0002) pour être réaffiché à son seul propriétaire. Une seule
 * adresse par personne : la régénérer invalide la précédente.
 */
@Injectable()
export class FluxIcalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(FIELD_ENCRYPTION) private readonly chiffrement: FieldEncryption,
  ) {}

  /**
   * État du flux de la personne connectée, adresse comprise : elle seule la lit (la ligne est
   * cherchée par sa propre fiche). Un jeton chiffré absent, illisible ou qui ne correspond plus à
   * l'empreinte n'est jamais renvoyé : la personne est invitée à régénérer.
   */
  async etat(tx: Transaction, access: Access): Promise<FluxIcal> {
    const [ligne] = await tx
      .select({
        empreinte: fluxIcal.jetonEmpreinte,
        chiffre: fluxIcal.jetonChiffre,
        regenereLe: fluxIcal.regenereLe,
      })
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, access.personneId));
    if (!ligne?.empreinte) return INACTIF;
    const jeton = ligne.chiffre ? this.dechiffrer(ligne.chiffre, access) : null;
    const valide = jeton !== null && lireJeton(jeton)?.empreinte === ligne.empreinte;
    return {
      actif: true,
      regenereLe: ligne.regenereLe?.toISOString() ?? null,
      url: valide ? this.adresse(jeton) : null,
      regenerationRequise: !valide,
    };
  }

  /** Crée l'adresse ou la remplace (l'ancienne cesse aussitôt de répondre). */
  async regenerer(tx: Transaction, access: Access, adresseIp: string): Promise<FluxIcal> {
    const { jeton, empreinte } = nouveauJeton(access.organisationId);
    const jetonChiffre = this.chiffrement.encrypt(
      jeton,
      access.organisationId,
      contexteJeton(access.personneId),
    );
    const maintenant = new Date();
    const [avant] = await tx
      .select({ id: fluxIcal.id, empreinte: fluxIcal.jetonEmpreinte })
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, access.personneId));
    // Une ligne par personne : deux demandes simultanées gardent la dernière adresse.
    const [ecrit] = await tx
      .insert(fluxIcal)
      .values({
        organisationId: access.organisationId,
        personneId: access.personneId,
        jetonEmpreinte: empreinte,
        jetonChiffre,
        regenereLe: maintenant,
        createdBy: access.userId,
      })
      .onConflictDoUpdate({
        target: [fluxIcal.organisationId, fluxIcal.personneId],
        set: {
          jetonEmpreinte: empreinte,
          jetonChiffre,
          regenereLe: maintenant,
          revoqueLe: null,
          updatedBy: access.userId,
        },
      })
      .returning({ id: fluxIcal.id });
    // Ni le jeton, ni son empreinte, ni sa forme chiffrée au journal : seulement l'état du flux.
    await enregistrerAudit(tx, {
      action: avant?.empreinte ? 'flux-ical.regenerer' : 'flux-ical.activer',
      objetType: 'personne',
      objetId: access.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: { actif: Boolean(avant?.empreinte), fluxId: ecrit?.id },
      apres: { actif: true, fluxId: ecrit?.id },
    });
    return {
      actif: true,
      regenereLe: maintenant.toISOString(),
      url: this.adresse(jeton),
      regenerationRequise: false,
    };
  }

  async revoquer(tx: Transaction, access: Access, adresseIp: string): Promise<FluxIcal> {
    const [avant] = await tx
      .select({ id: fluxIcal.id, empreinte: fluxIcal.jetonEmpreinte })
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, access.personneId));
    if (avant?.empreinte) {
      await tx
        .update(fluxIcal)
        .set({
          jetonEmpreinte: null,
          jetonChiffre: null,
          revoqueLe: new Date(),
          updatedBy: access.userId,
        })
        .where(eq(fluxIcal.id, avant.id));
      await enregistrerAudit(tx, {
        action: 'flux-ical.revoquer',
        objetType: 'personne',
        objetId: access.personneId,
        auteurId: access.userId,
        adresseIp,
        avant: { actif: true, fluxId: avant.id },
        apres: { actif: false, fluxId: avant.id },
      });
    }
    return INACTIF;
  }

  private adresse(jeton: string): string {
    return new URL(`/api/agenda/${jeton}.ics`, this.env.PUBLIC_URL).toString();
  }

  /** Valeur altérée ou clé retirée : traitée comme absente (régénération proposée). */
  private dechiffrer(chiffre: string, access: Access): string | null {
    try {
      return this.chiffrement.decrypt(
        chiffre,
        access.organisationId,
        contexteJeton(access.personneId),
      );
    } catch (error) {
      if (error instanceof FieldEncryptionError) return null;
      throw error;
    }
  }

  /**
   * Lecture publique du flux. Jeton inconnu, révoqué, fiche supprimée ou école fermée : la même
   * réponse « introuvable », sans rien révéler.
   */
  async lire(fichier: string, maintenant = new Date()): Promise<FluxIcalGenere> {
    const lu = lireJeton(fichier.replace(/\.ics$/, ''));
    if (!lu) throw new NotFoundException(INTROUVABLE);
    return withOrganisation(this.db, lu.organisationId, async (tx) => {
      const [titulaire] = await tx
        .select({
          personneId: fluxIcal.personneId,
          ecole: organisation.nomAffichage,
          acces: organisation.acces,
        })
        .from(fluxIcal)
        .innerJoin(
          personne,
          and(
            eq(personne.organisationId, fluxIcal.organisationId),
            eq(personne.id, fluxIcal.personneId),
          ),
        )
        .innerJoin(organisation, eq(organisation.id, fluxIcal.organisationId))
        .where(and(eq(fluxIcal.jetonEmpreinte, lu.empreinte), isNull(personne.deletedAt)));
      if (!titulaire || titulaire.acces === 'ferme') throw new NotFoundException(INTROUVABLE);

      const fenetre = fenetreFluxIcal(maintenant);
      const fuseauParDefaut = await this.fuseauParDefaut(tx);
      const evenements = await this.evenements(tx, titulaire.personneId, fenetre, fuseauParDefaut);
      const contenu = ecrireFluxIcal({
        evenements,
        fenetre,
        fuseauParDefaut,
        textes: {
          nomCalendrier: `Emploi du temps – ${titulaire.ecole}`,
          annulee: 'Annulé : ',
          reportee: 'Reporté : ',
          distanciel: 'À distance',
        },
      });
      const etag = `"${createHash('sha256').update(contenu).digest('base64url').slice(0, 32)}"`;
      return { contenu, etag };
    });
  }

  /**
   * Séances de la personne (intervenant ou apprenant attendu) sur la fenêtre, en deux requêtes
   * quel que soit leur nombre. Publiées, ou retirées après publication (annulées, reportées :
   * `modifieeLe` n'est posée que sur une séance publiée) ; jamais les brouillons (RG-04-13).
   */
  private async evenements(
    tx: Transaction,
    personneId: string,
    fenetre: { debut: Date; fin: Date },
    parDefaut: string,
  ): Promise<EvenementFluxIcal[]> {
    const lignes = await tx
      .select({
        id: seance.id,
        titre: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        distanciel: seance.distanciel,
        statut: seance.statut,
        modifieeLe: seance.modifieeLe,
        majLe: seance.updatedAt,
        salle: salle.nom,
        fuseau: etablissement.fuseauHoraire,
      })
      .from(seance)
      .leftJoin(
        salle,
        and(eq(salle.organisationId, seance.organisationId), eq(salle.id, seance.salleId)),
      )
      .leftJoin(
        etablissement,
        and(
          eq(etablissement.organisationId, salle.organisationId),
          eq(etablissement.id, salle.etablissementId),
        ),
      )
      .where(
        and(
          isNull(seance.deletedAt),
          lt(seance.debut, fenetre.fin),
          gt(seance.fin, fenetre.debut),
          or(
            eq(seance.statut, 'publiee'),
            and(inArray(seance.statut, ['annulee', 'reportee']), isNotNull(seance.modifieeLe)),
          ),
          or(
            inArray(
              seance.id,
              tx
                .select({ id: seanceIntervenant.seanceId })
                .from(seanceIntervenant)
                .where(
                  and(
                    eq(seanceIntervenant.personneId, personneId),
                    isNull(seanceIntervenant.deletedAt),
                  ),
                ),
            ),
            inArray(
              seance.id,
              tx
                .select({ id: seanceAttenduCalcule.seanceId })
                .from(seanceAttenduCalcule)
                .where(eq(seanceAttenduCalcule.personneId, personneId)),
            ),
          ),
        ),
      )
      .orderBy(asc(seance.debut), asc(seance.id))
      .limit(SEANCES_MAX);

    // Séance sans salle : fuseau de l'établissement de sa promotion (une requête pour toutes).
    const sansFuseau = lignes.filter((l) => !l.fuseau).map((l) => l.id);
    const fuseauPromotion = new Map<string, string>();
    if (sansFuseau.length > 0) {
      const publics = await tx
        .selectDistinct({ seanceId: seancePublic.seanceId, fuseau: etablissement.fuseauHoraire })
        .from(seancePublic)
        .innerJoin(
          promotion,
          and(
            eq(promotion.organisationId, seancePublic.organisationId),
            eq(promotion.id, seancePublic.promotionId),
          ),
        )
        .innerJoin(
          etablissement,
          and(
            eq(etablissement.organisationId, promotion.organisationId),
            eq(etablissement.id, promotion.etablissementId),
          ),
        )
        .where(and(inArray(seancePublic.seanceId, sansFuseau), isNull(seancePublic.deletedAt)))
        .orderBy(asc(etablissement.fuseauHoraire));
      for (const p of publics)
        if (!fuseauPromotion.has(p.seanceId)) fuseauPromotion.set(p.seanceId, p.fuseau);
    }
    return lignes.map((l) => ({
      id: l.id,
      titre: l.titre,
      debut: l.debut,
      fin: l.fin,
      fuseau: l.fuseau ?? fuseauPromotion.get(l.id) ?? parDefaut,
      lieu: l.salle,
      distanciel: l.distanciel,
      statut: l.statut === 'publiee' || l.statut === 'annulee' ? l.statut : 'reportee',
      modifieeLe: l.modifieeLe,
      majLe: l.majLe,
    }));
  }

  private async fuseauParDefaut(tx: Transaction): Promise<string> {
    const [premier] = await tx
      .select({ fuseau: etablissement.fuseauHoraire })
      .from(etablissement)
      .where(isNull(etablissement.deletedAt))
      .orderBy(asc(etablissement.fuseauHoraire))
      .limit(1);
    return premier?.fuseau ?? FUSEAU_PAR_DEFAUT;
  }
}

const INTROUVABLE =
  'Ce flux d’agenda n’existe pas ou a été révoqué. Copiez la nouvelle adresse depuis « Mes connexions ».';

/** Refus commun des routes « Mes connexions » quand l'école n'est pas accessible. */
export function verifierAccesFlux(access: Access, ecriture: boolean): void {
  if (access.acces === 'ferme' || (ecriture && access.acces === 'lecture_seule')) {
    throw new ForbiddenException(
      'Votre établissement n’autorise pas cette action pour le moment. Contactez la scolarité.',
    );
  }
}
