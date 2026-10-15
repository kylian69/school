import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FUSEAU_PAR_DEFAUT,
  LIMITE_SUIVI_ASSIDUITE,
  PLAGE_EDT_PAR_DEFAUT,
  type Absence,
  type AlerteAssiduite,
  type FiltreAssiduite,
  type FiltreTableauAssiduite,
  type TableauAssiduite,
  type MesAbsences,
  type SuiviAssiduite,
} from '@scolaly/contracts';
import {
  absence,
  alerteAssiduite,
  donneesSeuilsAssiduite,
  enregistrerAudit,
  formation,
  justificatif,
  lireSeuils,
  etablissementDeSeance,
  inscription,
  inscriptionStatut,
  personne,
  promotion,
  seance,
  type Transaction,
} from '@scolaly/db';
import {
  absencesDeLAppel,
  BORNES_SEUILS_ASSIDUITE,
  changementsAbsences,
  debutFenetre,
  evaluerAssiduite,
  seuilsApplicables,
  decompteAssiduite,
  estAlternant,
  STATUTS_ALTERNANT,
  type LigneAbsence,
} from '@scolaly/domain';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { couvrePromotion, promotionsCouvertes } from '../scolarite/index.js';
import { justificatifsDesAbsences } from './justificatifs.service.js';

/** Séance d'un appel validé, telle que le calcul des absences la lit. */
export interface SeanceAbsences {
  id: string;
  debut: Date;
  fin: Date;
  salleId: string | null;
  serieId: string | null;
}

const colonnesAbsence = {
  id: absence.id,
  seanceId: absence.seanceId,
  libelle: seance.libelle,
  debut: seance.debut,
  fin: seance.fin,
  jour: absence.jour,
  matin: absence.matin,
  apresMidi: absence.apresMidi,
  nature: absence.nature,
  minutes: absence.minutes,
  statut: absence.statut,
};

type LigneLue = { debut: Date; fin: Date } & Omit<Absence, 'debut' | 'fin' | 'justificatif'>;

/** Absences présentées, avec leur dernier justificatif (RG-06-21). */
async function presenter<T extends LigneLue>(tx: Transaction, lignes: readonly T[]) {
  const justificatifs = await justificatifsDesAbsences(
    tx,
    lignes.map((l) => l.id),
  );
  return lignes.map((l) => ({
    ...l,
    debut: l.debut.toISOString(),
    fin: l.fin.toISOString(),
    justificatif: justificatifs.get(l.id) ?? null,
  }));
}

const presenterAlerte = (a: typeof alerteAssiduite.$inferSelect): AlerteAssiduite => ({
  id: a.id,
  niveau: a.niveau === 2 ? 2 : 1,
  declencheeLe: a.declencheeLe.toISOString(),
  demiJournees: a.demiJournees,
  seuil: a.seuil,
  fenetreJours: a.fenetreJours,
  statut: a.statut,
  traiteeLe: a.traiteeLe?.toISOString() ?? null,
});

/** Jour UTC courant (AAAA-MM-JJ) : statut d’'alternance en cours. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * Retards et absences (I4.4 ; RG-06-16 à RG-06-18) : calculés à chaque version validée de l'appel,
 * dans sa transaction (jamais sur le chemin du scan), puis consultés par l'apprenant (US-06-13)
 * et, dans leur périmètre, par la scolarité et la pédagogie (E-06-07).
 */
@Injectable()
export class AssiduiteService {
  /**
   * Recalcule les absences d'une séance à partir de sa liste validée : une absence qui reste garde
   * son statut de justification (RG-06-21). Le changement est tracé avec l'avant et l'après.
   */
  async recalculer(
    tx: Transaction,
    access: Access,
    s: SeanceAbsences,
    version: number,
    liste: readonly LigneAbsence[],
    adresseIp: string,
  ): Promise<void> {
    const etab = await etablissementDeSeance(tx, s);
    const calculees = absencesDeLAppel(
      {
        debut: s.debut,
        fin: s.fin,
        fuseau: etab?.fuseauHoraire ?? FUSEAU_PAR_DEFAUT,
        limiteMidi: etab?.edtLimiteMidi.slice(0, 5) ?? PLAGE_EDT_PAR_DEFAUT.limiteMidi,
      },
      liste,
    );
    const enregistrees = await tx
      .select({
        id: absence.id,
        personneId: absence.personneId,
        nature: absence.nature,
        minutes: absence.minutes,
        jour: absence.jour,
        matin: absence.matin,
        apresMidi: absence.apresMidi,
      })
      .from(absence)
      .where(eq(absence.seanceId, s.id));
    const c = changementsAbsences(enregistrees, calculees);
    if (c.ajouts.length + c.modifications.length + c.retraits.length === 0) return;
    if (c.retraits.length > 0)
      await tx.delete(absence).where(
        inArray(
          absence.id,
          c.retraits.map((r) => r.id),
        ),
      );
    for (const { avant, apres } of c.modifications) {
      await tx
        .update(absence)
        .set({
          nature: apres.nature,
          minutes: apres.minutes,
          jour: apres.jour,
          matin: apres.matin,
          apresMidi: apres.apresMidi,
          versionAppel: version,
          updatedBy: access.userId,
        })
        .where(eq(absence.id, avant.id));
    }
    if (c.ajouts.length > 0)
      await tx.insert(absence).values(
        c.ajouts.map((a) => ({
          organisationId: access.organisationId,
          seanceId: s.id,
          ...a,
          versionAppel: version,
          createdBy: access.userId,
        })),
      );
    const resume = (a: { personneId: string; nature: string; minutes: number }) => ({
      personneId: a.personneId,
      nature: a.nature,
      minutes: a.minutes,
    });
    await enregistrerAudit(tx, {
      action: 'absence.recalculer',
      objetType: 'seance',
      objetId: s.id,
      auteurId: access.userId,
      adresseIp,
      avant: {
        absences: [...c.retraits, ...c.modifications.map((m) => m.avant)].map(resume),
      },
      apres: {
        version,
        absences: [...c.ajouts, ...c.modifications.map((m) => m.apres)].map(resume),
      },
    });
  }

  /** US-06-13, E-06-04 : ses propres retards et absences, avec son décompte. */
  async mesAbsences(
    tx: Transaction,
    access: Access,
  ): Promise<Omit<MesAbsences, 'justificatifs' | 'delaiHeures'>> {
    const lignes = await tx
      .select(colonnesAbsence)
      .from(absence)
      .innerJoin(seance, eq(seance.id, absence.seanceId))
      .where(eq(absence.personneId, access.personneId))
      .orderBy(desc(seance.debut));
    const aujourdHui = aujourdhui();
    const [alternance] = await tx
      .select({ statut: inscriptionStatut.statut })
      .from(inscriptionStatut)
      .innerJoin(inscription, eq(inscription.id, inscriptionStatut.inscriptionId))
      .where(
        and(
          eq(inscription.personneId, access.personneId),
          isNull(inscription.deletedAt),
          isNull(inscriptionStatut.deletedAt),
          inArray(inscriptionStatut.statut, [...STATUTS_ALTERNANT]),
          lte(inscriptionStatut.debut, aujourdHui),
          or(isNull(inscriptionStatut.fin), gte(inscriptionStatut.fin, aujourdHui)),
        ),
      )
      .limit(1);
    return {
      decompte: decompteAssiduite(lignes),
      alternant: estAlternant(alternance?.statut),
      absences: await presenter(tx, lignes),
    };
  }

  /**
   * E-06-07 : retards et absences des apprenants inscrits (le jour de la séance) dans une promotion
   * du périmètre de `assiduite:lire`, filtrés par promotion, période, nature et statut.
   */
  async suivi(tx: Transaction, access: Access, filtre: FiltreAssiduite): Promise<SuiviAssiduite> {
    const couvertes = await promotionsCouvertes(tx, access, ['assiduite:lire']);
    const promotions = (
      await tx
        .select({ id: promotion.id, libelle: promotion.libelle })
        .from(promotion)
        .where(isNull(promotion.deletedAt))
        .orderBy(asc(promotion.libelle))
    ).filter((p) => couvrePromotion(couvertes, p.id));
    const visibles = filtre.promotionId
      ? promotions.filter((p) => p.id === filtre.promotionId)
      : promotions;
    const vide: SuiviAssiduite = { promotions, apprenants: [], absences: [], tronque: false };
    if (visibles.length === 0) return vide;
    // L'apprenant était inscrit dans une promotion visible le jour de la séance.
    const inscritCeJour = (promotionIds: string[]): SQL =>
      exists(
        tx
          .select({ un: sql`1` })
          .from(inscription)
          .where(
            and(
              eq(inscription.personneId, absence.personneId),
              inArray(inscription.promotionId, promotionIds),
              isNull(inscription.deletedAt),
              lte(inscription.dateEntree, absence.jour),
              or(isNull(inscription.dateSortie), gt(inscription.dateSortie, absence.jour)),
            ),
          ),
      );
    const conditions = and(
      couvertes === null && !filtre.promotionId
        ? undefined
        : inscritCeJour(visibles.map((p) => p.id)),
      filtre.du ? gte(absence.jour, filtre.du) : undefined,
      filtre.au ? lte(absence.jour, filtre.au) : undefined,
      filtre.statut ? eq(absence.statut, filtre.statut) : undefined,
      filtre.nature ? eq(absence.nature, filtre.nature) : undefined,
    );
    const lignes = await tx
      .select({
        ...colonnesAbsence,
        personneId: absence.personneId,
        nom: sql<string>`coalesce(${personne.nomUsage}, ${personne.nom})`,
        prenom: personne.prenom,
      })
      .from(absence)
      .innerJoin(seance, eq(seance.id, absence.seanceId))
      .innerJoin(personne, eq(personne.id, absence.personneId))
      .where(conditions)
      .orderBy(desc(seance.debut), asc(personne.nom), asc(personne.prenom));
    // Décompte par apprenant, sur toutes les lignes retenues.
    const parApprenant = new Map<string, typeof lignes>();
    for (const l of lignes) {
      const liste = parApprenant.get(l.personneId) ?? [];
      liste.push(l);
      parApprenant.set(l.personneId, liste);
    }
    const ids = [...parApprenant.keys()];
    const aujourdHui = aujourdhui();
    const inscriptions =
      ids.length === 0
        ? []
        : await tx
            .select({
              personneId: inscription.personneId,
              promotion: promotion.libelle,
              statut: inscriptionStatut.statut,
            })
            .from(inscription)
            .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
            .leftJoin(
              inscriptionStatut,
              and(
                eq(inscriptionStatut.inscriptionId, inscription.id),
                isNull(inscriptionStatut.deletedAt),
                lte(inscriptionStatut.debut, aujourdHui),
                or(isNull(inscriptionStatut.fin), gte(inscriptionStatut.fin, aujourdHui)),
              ),
            )
            .where(
              and(
                inArray(inscription.personneId, ids),
                inArray(
                  inscription.promotionId,
                  visibles.map((p) => p.id),
                ),
                isNull(inscription.deletedAt),
              ),
            )
            .orderBy(desc(inscription.dateEntree));
    const apprenants = [...parApprenant].map(([personneId, absences]) => {
      const siennes = inscriptions.filter((i) => i.personneId === personneId);
      return {
        personneId,
        nom: absences[0]?.nom ?? '',
        prenom: absences[0]?.prenom ?? '',
        promotion: siennes[0]?.promotion ?? null,
        alternant: siennes.some((i) => estAlternant(i.statut)),
        decompte: decompteAssiduite(absences),
      };
    });
    apprenants.sort(
      (a, b) =>
        b.decompte.demiJourneesNonJustifiees - a.decompte.demiJourneesNonJustifiees ||
        a.nom.localeCompare(b.nom, 'fr') ||
        a.prenom.localeCompare(b.prenom, 'fr'),
    );
    return {
      promotions,
      apprenants,
      absences: await presenter(tx, lignes.slice(0, LIMITE_SUIVI_ASSIDUITE)),
      tronque: lignes.length > LIMITE_SUIVI_ASSIDUITE,
    };
  }

  /**
   * E-06-07, US-06-10, RG-06-23 : tableau de bord de l'assiduité. Apprenants de mon périmètre au
   * niveau 1 ou 2 aujourd'hui (demi-journées non justifiées sur leur période glissante, seuils de
   * leur formation ou de l'école) ou qui ont une alerte ouverte, avec les indicateurs.
   */
  async tableauDeBord(
    tx: Transaction,
    access: Access,
    filtre: FiltreTableauAssiduite,
  ): Promise<TableauAssiduite> {
    const couvertes = await promotionsCouvertes(tx, access, ['assiduite:lire']);
    const promotions = (
      await tx
        .select({ id: promotion.id, libelle: promotion.libelle })
        .from(promotion)
        .where(isNull(promotion.deletedAt))
        .orderBy(asc(promotion.libelle))
    ).filter((p) => couvrePromotion(couvertes, p.id));
    const visibles = new Set(
      promotions.filter((p) => !filtre.promotionId || p.id === filtre.promotionId).map((p) => p.id),
    );
    const toutes = couvertes === null && !filtre.promotionId;
    const traitable = access.permissions.has('assiduite:alertes');
    if (!toutes && visibles.size === 0) {
      const zero = { niveau1: 0, niveau2: 0, alertesOuvertes: 0, demiJourneesNonJustifiees: 0 };
      return {
        promotions,
        indicateurs: { ...zero, justificatifsATraiter: 0 },
        apprenants: [],
        traitable,
      };
    }
    const aujourdHui = aujourdhui();
    const { ecole, apprenants } = await donneesSeuilsAssiduite(
      tx,
      debutFenetre(aujourdHui, BORNES_SEUILS_ASSIDUITE.fenetreJours.max),
      aujourdHui,
    );
    const ouvertes = await tx
      .select()
      .from(alerteAssiduite)
      .where(eq(alerteAssiduite.statut, 'ouverte'))
      .orderBy(desc(alerteAssiduite.declencheeLe));
    const ids = [
      ...new Set([...apprenants.map((a) => a.personneId), ...ouvertes.map((a) => a.personneId)]),
    ];
    const inscrits =
      ids.length === 0
        ? []
        : await tx
            .select({
              personneId: inscription.personneId,
              promotionId: inscription.promotionId,
              promotion: promotion.libelle,
              nom: sql<string>`coalesce(${personne.nomUsage}, ${personne.nom})`,
              prenom: personne.prenom,
              statut: inscriptionStatut.statut,
              assiduiteSeuilNiveau1: formation.assiduiteSeuilNiveau1,
              assiduiteSeuilNiveau2: formation.assiduiteSeuilNiveau2,
              assiduiteFenetreJours: formation.assiduiteFenetreJours,
            })
            .from(inscription)
            .innerJoin(personne, eq(personne.id, inscription.personneId))
            .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
            .innerJoin(formation, eq(formation.id, promotion.formationId))
            .leftJoin(
              inscriptionStatut,
              and(
                eq(inscriptionStatut.inscriptionId, inscription.id),
                isNull(inscriptionStatut.deletedAt),
                lte(inscriptionStatut.debut, aujourdHui),
                or(isNull(inscriptionStatut.fin), gte(inscriptionStatut.fin, aujourdHui)),
              ),
            )
            .where(
              and(
                inArray(inscription.personneId, ids),
                isNull(inscription.deletedAt),
                isNull(personne.deletedAt),
                lte(inscription.dateEntree, aujourdHui),
                or(isNull(inscription.dateSortie), gt(inscription.dateSortie, aujourdHui)),
              ),
            )
            .orderBy(desc(inscription.dateEntree));
    const suivis = ids.flatMap((personneId) => {
      const siennes = inscrits.filter((i) => i.personneId === personneId);
      // Suivi par ses inscriptions en cours, dans une promotion visible.
      const premiere = siennes[0];
      if (!premiere || !(toutes || siennes.some((i) => visibles.has(i.promotionId)))) return [];
      const seuils = seuilsApplicables(ecole, siennes.map(lireSeuils));
      const absences = apprenants.find((a) => a.personneId === personneId)?.absences ?? [];
      const e = evaluerAssiduite(absences, seuils, aujourdHui);
      return [
        {
          personneId,
          nom: premiere.nom,
          prenom: premiere.prenom,
          promotion: premiere.promotion,
          alternant: siennes.some((i) => estAlternant(i.statut)),
          seuils,
          demiJourneesNonJustifiees: e.demiJourneesNonJustifiees,
          niveau: e.niveau,
          alertes: ouvertes.filter((a) => a.personneId === personneId).map(presenterAlerte),
        },
      ];
    });
    const enAlerte = suivis.filter((a) => a.niveau > 0 || a.alertes.length > 0);
    const [aTraiter] = await tx
      .select({ nombre: sql<number>`count(*)::int` })
      .from(justificatif)
      .where(
        and(
          eq(justificatif.statut, 'a-traiter'),
          isNull(justificatif.deletedAt),
          toutes
            ? undefined
            : exists(
                tx
                  .select({ un: sql`1` })
                  .from(inscription)
                  .where(
                    and(
                      eq(inscription.personneId, justificatif.personneId),
                      inArray(inscription.promotionId, [...visibles]),
                      isNull(inscription.deletedAt),
                    ),
                  ),
              ),
        ),
      );
    const niveauMin = filtre.niveau ? Number(filtre.niveau) : 0;
    return {
      promotions,
      indicateurs: {
        niveau1: suivis.filter((a) => a.niveau === 1).length,
        niveau2: suivis.filter((a) => a.niveau === 2).length,
        alertesOuvertes: suivis.reduce((n, a) => n + a.alertes.length, 0),
        demiJourneesNonJustifiees: suivis.reduce((n, a) => n + a.demiJourneesNonJustifiees, 0),
        justificatifsATraiter: aTraiter?.nombre ?? 0,
      },
      apprenants: enAlerte
        .filter((a) => a.niveau >= niveauMin && (!filtre.alertes || a.alertes.length > 0))
        .sort(
          (a, b) =>
            b.niveau - a.niveau ||
            b.demiJourneesNonJustifiees - a.demiJourneesNonJustifiees ||
            a.nom.localeCompare(b.nom, 'fr') ||
            a.prenom.localeCompare(b.prenom, 'fr'),
        ),
      traitable,
    };
  }

  /**
   * RG-06-23 : marque une alerte traitée (apprenant d'une promotion du périmètre de
   * `assiduite:alertes`, sinon 404). Une alerte déjà traitée est rendue telle quelle.
   */
  async traiterAlerte(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<AlerteAssiduite> {
    const [alerte] = await tx.select().from(alerteAssiduite).where(eq(alerteAssiduite.id, id));
    const couvertes = await promotionsCouvertes(tx, access, ['assiduite:alertes']);
    const inscriptions = alerte
      ? await tx
          .select({ promotionId: inscription.promotionId })
          .from(inscription)
          .where(and(eq(inscription.personneId, alerte.personneId), isNull(inscription.deletedAt)))
      : [];
    const couverte =
      couvertes === null || inscriptions.some((i) => couvrePromotion(couvertes, i.promotionId));
    if (!alerte || alerte.deletedAt || !couverte)
      throw new NotFoundException('Alerte introuvable. Actualisez le tableau de bord.');
    if (alerte.statut === 'traitee') return presenterAlerte(alerte);
    const [apres] = await tx
      .update(alerteAssiduite)
      .set({
        statut: 'traitee',
        traiteeLe: new Date(),
        traiteePar: access.personneId,
        updatedBy: access.userId,
      })
      .where(eq(alerteAssiduite.id, id))
      .returning();
    await enregistrerAudit(tx, {
      action: 'alerte-assiduite.traiter',
      objetType: 'alerte_assiduite',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: { statut: alerte.statut, personneId: alerte.personneId, niveau: alerte.niveau },
      apres: { statut: 'traitee', personneId: alerte.personneId, niveau: alerte.niveau },
    });
    return presenterAlerte(apres ?? alerte);
  }
}
