import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreneauDisponibilite,
  IndisponibiliteDeclaree,
  MesDisponibilites,
  PlageEdt,
  SaisieCreneauDisponibilite,
  SaisieIndisponibilite,
} from '@scolaly/contracts';
import {
  disponibiliteIntervenant,
  enregistrerAudit,
  etablissement,
  indisponibiliteIntervenant,
  newId,
  type Transaction,
} from '@scolaly/db';
import {
  erreursCreneau,
  erreursIndisponibilite,
  instantLocal,
  type ErreurCreneau,
  type ErreurIndisponibilite,
} from '@scolaly/domain';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { FieldEncryption, FieldEncryptionError } from '../../shared/crypto/field-encryption.js';
import { plageEdt } from '../../shared/plage-edt.js';
import { FIELD_ENCRYPTION } from '../../shared/tokens.js';

const FUSEAU_PAR_DEFAUT = 'Europe/Paris';
/** Garde-fou : une semaine type tient en quelques créneaux par jour. */
const CRENEAUX_MAX = 70;
const INDISPONIBILITES_MAX = 200;

/** Données associées du chiffrement : le motif n'est lisible que sur sa ligne. */
const contexteMotif = (id: string) => `indisponibilite_intervenant.motif:${id}`;

/**
 * Motif d'une indisponibilité, lu par l'intervenant ou par un gestionnaire de son périmètre ;
 * valeur altérée ou clé retirée : traité comme absent.
 */
export function lireMotifIndisponibilite(
  chiffrement: FieldEncryption,
  organisationId: string,
  ligne: { id: string; motifChiffre: string | null },
): string | null {
  if (!ligne.motifChiffre) return null;
  try {
    return chiffrement.decrypt(ligne.motifChiffre, organisationId, contexteMotif(ligne.id));
  } catch (error) {
    if (error instanceof FieldEncryptionError) return null;
    throw error;
  }
}

const MESSAGES_CRENEAU: Record<ErreurCreneau, [string, string]> = {
  bornes: ['heureFin', 'L’heure de fin doit suivre l’heure de début.'],
  periode: ['valableAu', 'La fin de validité doit suivre son début.'],
  'jour-non-ouvre': ['jourSemaine', 'Ce jour n’est pas ouvré dans votre établissement.'],
  'hors-plage': [
    'heureDebut',
    'Ce créneau sort des heures de cours de l’établissement : restez dans la plage indiquée.',
  ],
  chevauchement: [
    'heureDebut',
    'Ce créneau chevauche un créneau déjà déclaré ce jour-là : modifiez l’un des deux.',
  ],
};

const MESSAGES_INDISPONIBILITE: Record<ErreurIndisponibilite, [string, string]> = {
  bornes: ['fin', 'La fin doit suivre le début.'],
  passee: ['fin', 'Cette période est déjà passée : déclarez une indisponibilité à venir.'],
  'trop-longue': [
    'fin',
    'Une indisponibilité couvre au plus un an : pour une absence plus longue, prévenez la scolarité.',
  ],
  chevauchement: [
    'debut',
    'Cette période chevauche une indisponibilité déjà déclarée : modifiez-la plutôt.',
  ],
};

const invalide = (details: [string, string][]) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: details.map(([champ, message]) => `${champ} : ${message}`),
  });

/**
 * E-04-07 · Mes disponibilités (RG-04-18, US-04-10) : l'intervenant connecté déclare ses créneaux
 * récurrents et ses indisponibilités ponctuelles. Tout porte sur sa propre fiche (périmètre
 * « soi ») ; la détection des conflits les lit sans le motif, la grille ne le montre qu'aux
 * gestionnaires de l'intervenant (GrilleService).
 */
@Injectable()
export class DisponibilitesService {
  constructor(@Inject(FIELD_ENCRYPTION) private readonly chiffrement: FieldEncryption) {}

  async lire(tx: Transaction, access: Access, maintenant = new Date()): Promise<MesDisponibilites> {
    const { fuseau, plage } = await this.cadre(tx);
    const creneaux = await this.creneaux(tx, access.personneId);
    const indisponibilites = await tx
      .select()
      .from(indisponibiliteIntervenant)
      .where(
        and(
          eq(indisponibiliteIntervenant.personneId, access.personneId),
          isNull(indisponibiliteIntervenant.deletedAt),
          gt(indisponibiliteIntervenant.fin, maintenant),
        ),
      )
      .orderBy(asc(indisponibiliteIntervenant.debut));
    return {
      fuseau,
      plage,
      creneaux: creneaux.map(versCreneau),
      indisponibilites: indisponibilites.map((i) => this.versIndisponibilite(i, access)),
    };
  }

  async ajouterCreneau(
    tx: Transaction,
    access: Access,
    saisie: SaisieCreneauDisponibilite,
    adresseIp: string,
  ): Promise<MesDisponibilites> {
    await verrouiller(tx, access.personneId);
    const { plage } = await this.cadre(tx);
    const existants = await this.creneaux(tx, access.personneId);
    if (existants.length >= CRENEAUX_MAX)
      throw invalide([['jourSemaine', `Vous avez déjà ${CRENEAUX_MAX} créneaux : regroupez-en.`]]);
    const erreurs = erreursCreneau(saisie, existants.map(versCreneau), plage);
    if (erreurs.length > 0) throw invalide(erreurs.map((e) => MESSAGES_CRENEAU[e]));
    const [cree] = await tx
      .insert(disponibiliteIntervenant)
      .values({
        organisationId: access.organisationId,
        personneId: access.personneId,
        jourSemaine: saisie.jourSemaine,
        heureDebut: saisie.heureDebut,
        heureFin: saisie.heureFin,
        valableDu: saisie.valableDu,
        valableAu: saisie.valableAu,
        createdBy: access.userId,
        updatedBy: access.userId,
      })
      .returning({ id: disponibiliteIntervenant.id });
    await enregistrerAudit(tx, {
      action: 'disponibilite.ajouter',
      objetType: 'personne',
      objetId: access.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: null,
      apres: { creneauId: cree?.id, ...saisie },
    });
    return this.lire(tx, access);
  }

  async retirerCreneau(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<MesDisponibilites> {
    const [ligne] = await tx
      .update(disponibiliteIntervenant)
      .set({ deletedAt: new Date(), updatedBy: access.userId, updatedAt: new Date() })
      .where(
        and(
          eq(disponibiliteIntervenant.id, id),
          eq(disponibiliteIntervenant.personneId, access.personneId),
          isNull(disponibiliteIntervenant.deletedAt),
        ),
      )
      .returning();
    if (!ligne) throw new NotFoundException('Ce créneau n’existe plus : rechargez la page.');
    await enregistrerAudit(tx, {
      action: 'disponibilite.retirer',
      objetType: 'personne',
      objetId: access.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: { ...versCreneau(ligne), creneauId: ligne.id },
      apres: null,
    });
    return this.lire(tx, access);
  }

  async ajouterIndisponibilite(
    tx: Transaction,
    access: Access,
    saisie: SaisieIndisponibilite,
    adresseIp: string,
    maintenant = new Date(),
  ): Promise<MesDisponibilites> {
    await verrouiller(tx, access.personneId);
    const { fuseau } = await this.cadre(tx);
    const [jourDebut = '', heureDebut = ''] = saisie.debut.split('T');
    const [jourFin = '', heureFin = ''] = saisie.fin.split('T');
    const debut = instantLocal(jourDebut, heureDebut, fuseau);
    const fin = instantLocal(jourFin, heureFin, fuseau);
    const existantes = await tx
      .select({
        debut: indisponibiliteIntervenant.debut,
        fin: indisponibiliteIntervenant.fin,
      })
      .from(indisponibiliteIntervenant)
      .where(
        and(
          eq(indisponibiliteIntervenant.personneId, access.personneId),
          isNull(indisponibiliteIntervenant.deletedAt),
          gt(indisponibiliteIntervenant.fin, maintenant),
        ),
      );
    if (existantes.length >= INDISPONIBILITES_MAX)
      throw invalide([['debut', 'Trop d’indisponibilités à venir : regroupez-les.']]);
    const erreurs = erreursIndisponibilite({ debut, fin }, existantes, maintenant);
    if (erreurs.length > 0) throw invalide(erreurs.map((e) => MESSAGES_INDISPONIBILITE[e]));
    // Motif vide : aucun motif. Chiffré avec l'identifiant de sa ligne comme donnée associée.
    const motif = saisie.motif?.trim() ? saisie.motif.trim() : null;
    const id = newId();
    await tx.insert(indisponibiliteIntervenant).values({
      id,
      organisationId: access.organisationId,
      personneId: access.personneId,
      debut,
      fin,
      motifChiffre: motif
        ? this.chiffrement.encrypt(motif, access.organisationId, contexteMotif(id))
        : null,
      createdBy: access.userId,
      updatedBy: access.userId,
    });
    // Le motif ne va jamais au journal : seulement sa présence.
    await enregistrerAudit(tx, {
      action: 'indisponibilite.ajouter',
      objetType: 'personne',
      objetId: access.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: null,
      apres: {
        indisponibiliteId: id,
        debut: debut.toISOString(),
        fin: fin.toISOString(),
        motifRenseigne: motif !== null,
      },
    });
    return this.lire(tx, access, maintenant);
  }

  async retirerIndisponibilite(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<MesDisponibilites> {
    // Le motif est effacé avec la ligne : rien ne reste à protéger dans la corbeille.
    const [ligne] = await tx
      .update(indisponibiliteIntervenant)
      .set({
        deletedAt: new Date(),
        motifChiffre: null,
        updatedBy: access.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(indisponibiliteIntervenant.id, id),
          eq(indisponibiliteIntervenant.personneId, access.personneId),
          isNull(indisponibiliteIntervenant.deletedAt),
        ),
      )
      .returning({
        id: indisponibiliteIntervenant.id,
        debut: indisponibiliteIntervenant.debut,
        fin: indisponibiliteIntervenant.fin,
      });
    if (!ligne)
      throw new NotFoundException('Cette indisponibilité n’existe plus : rechargez la page.');
    await enregistrerAudit(tx, {
      action: 'indisponibilite.retirer',
      objetType: 'personne',
      objetId: access.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: {
        indisponibiliteId: ligne.id,
        debut: ligne.debut.toISOString(),
        fin: ligne.fin.toISOString(),
      },
      apres: null,
    });
    return this.lire(tx, access);
  }

  /**
   * Fuseau et plage de saisie. Un intervenant peut enseigner dans plusieurs établissements : la
   * plage retenue est la plus large (heures extrêmes, jours ouvrés de l'un ou l'autre), pour ne
   * refuser aucun créneau utile ; le fuseau et la limite de midi sont ceux du premier
   * établissement par ordre alphabétique.
   */
  private async cadre(tx: Transaction): Promise<{ fuseau: string; plage: PlageEdt }> {
    const etablissements = await tx
      .select({
        fuseau: etablissement.fuseauHoraire,
        edtDebut: etablissement.edtDebut,
        edtFin: etablissement.edtFin,
        edtLimiteMidi: etablissement.edtLimiteMidi,
        edtJoursOuvres: etablissement.edtJoursOuvres,
      })
      .from(etablissement)
      .where(isNull(etablissement.deletedAt))
      .orderBy(asc(etablissement.nom), asc(etablissement.id));
    const [premier] = etablissements;
    if (!premier)
      return {
        fuseau: FUSEAU_PAR_DEFAUT,
        plage: { debut: '08:00', fin: '19:00', limiteMidi: '13:00', joursOuvres: [1, 2, 3, 4, 5] },
      };
    const plages = etablissements.map(plageEdt);
    const premiere = plageEdt(premier);
    return {
      fuseau: premier.fuseau,
      plage: {
        debut: plages.reduce((min, p) => (p.debut < min ? p.debut : min), premiere.debut),
        fin: plages.reduce((max, p) => (p.fin > max ? p.fin : max), premiere.fin),
        limiteMidi: premiere.limiteMidi,
        joursOuvres: [...new Set(plages.flatMap((p) => p.joursOuvres))].sort((a, b) => a - b),
      },
    };
  }

  private creneaux(tx: Transaction, personneId: string) {
    return tx
      .select()
      .from(disponibiliteIntervenant)
      .where(
        and(
          eq(disponibiliteIntervenant.personneId, personneId),
          isNull(disponibiliteIntervenant.deletedAt),
        ),
      )
      .orderBy(
        asc(disponibiliteIntervenant.jourSemaine),
        asc(disponibiliteIntervenant.heureDebut),
        asc(disponibiliteIntervenant.valableDu),
      );
  }

  private versIndisponibilite(
    i: typeof indisponibiliteIntervenant.$inferSelect,
    access: Access,
  ): IndisponibiliteDeclaree {
    return {
      id: i.id,
      debut: i.debut.toISOString(),
      fin: i.fin.toISOString(),
      motif: lireMotifIndisponibilite(this.chiffrement, access.organisationId, i),
    };
  }
}

const versCreneau = (c: typeof disponibiliteIntervenant.$inferSelect): CreneauDisponibilite => ({
  id: c.id,
  jourSemaine: c.jourSemaine,
  heureDebut: c.heureDebut.slice(0, 5),
  heureFin: c.heureFin.slice(0, 5),
  valableDu: c.valableDu,
  valableAu: c.valableAu,
});

/** Deux saisies simultanées de la même personne ne contournent pas le contrôle de chevauchement. */
async function verrouiller(tx: Transaction, personneId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`disponibilites:${personneId}`}, 0))`,
  );
}
