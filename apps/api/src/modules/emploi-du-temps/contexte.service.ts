import { Injectable } from '@nestjs/common';
import {
  conventionStage,
  disponibiliteIntervenant,
  fermeture,
  fermetureEtablissement,
  groupeMembre,
  indisponibiliteIntervenant,
  inscription,
  maquetteModule,
  salle,
  seance,
  seanceForcage,
  seanceIntervenant,
  seancePublic,
  type Transaction,
} from '@scolaly/db';
import {
  jourLocal,
  type ContexteConflits,
  type Forcage,
  type SeancePlanifiee,
  type TypeSeance,
} from '@scolaly/domain';
import type { Intervalle } from '@scolaly/domain';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { joursFeriesNationauxDe } from '../../shared/calendrier/jours-feries.js';
import { RythmesService } from '../alternance/index.js';

type LigneSeanceBrute = typeof seance.$inferSelect;
export type LigneSeance = LigneSeanceBrute & {
  promotionIds: string[];
  groupeIds: string[];
  /** RG-04-01 : intervenants de la séance (seance_intervenant), triés. */
  intervenantIds: string[];
};

const JOUR_MS = 86_400_000;
const STAGES = ['signee', 'en_cours', 'terminee'] as const;

/** Jours civils de debut à fin inclus (AAAA-MM-JJ). */
export function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let t = Date.parse(`${debut}T00:00:00Z`); t <= Date.parse(`${fin}T00:00:00Z`); t += JOUR_MS)
    jours.push(new Date(t).toISOString().slice(0, 10));
  return jours;
}

/** Séance au format du domaine ; une séance d'avant I4.1 sans type n'a pas de module à suivre. */
export function versPlanifiee(l: LigneSeance): SeancePlanifiee {
  return {
    id: l.id,
    debut: l.debut,
    fin: l.fin,
    statut: l.statut,
    type: (l.type ?? 'cm') satisfies TypeSeance,
    moduleId: l.moduleId,
    salleId: l.salleId,
    intervenantIds: l.intervenantIds,
    // Le public d'une séance : une promotion entière se contrôle comme un groupe.
    groupeIds: [...l.promotionIds, ...l.groupeIds],
  };
}

/** Fermeture ou jour férié, avec son libellé pour le fond de la grille. */
export type Fermeture = Intervalle & { libelle: string };

/** Volume de la maquette d'un module, en minutes par type planifiable. */
export function volumeEnMinutes(m: typeof maquetteModule.$inferSelect) {
  return {
    cm: m.heuresCm * 60,
    td: m.heuresTd * 60,
    tp: m.heuresTp * 60,
    projet: m.heuresProjet * 60,
  };
}

export interface FenetreContexte {
  etablissementId: string;
  fuseau: string;
  debut: Date;
  fin: Date;
  /** Modules dont toutes les séances sont chargées pour le contrôle de volume. */
  moduleIds: readonly string[];
  /** Publics (promotions et groupes) des séances contrôlées, en plus de ceux des séances chargées. */
  publicIds: readonly string[];
  /** Intervenants des séances contrôlées, en plus de ceux des séances chargées. */
  intervenantIds?: readonly string[];
}

/**
 * Données du contrôle des conflits (RG-04-05) : séances de la période, brouillons compris, et
 * toutes celles des modules contrôlés ; apprenants des publics ; salles ; fermetures et jours
 * fériés ; jours en entreprise et stages ; disponibilités des intervenants (RG-04-18) ; volumes
 * de la maquette.
 */
@Injectable()
export class ContexteService {
  constructor(private readonly rythmes: RythmesService) {}

  /** Séances non supprimées, avec leur public et leurs intervenants. */
  async seances(tx: Transaction, filtre: ReturnType<typeof and>): Promise<LigneSeance[]> {
    const lignes = await tx
      .select()
      .from(seance)
      .where(and(isNull(seance.deletedAt), filtre));
    return this.avecPublics(tx, lignes);
  }

  async avecPublics(tx: Transaction, lignes: LigneSeanceBrute[]): Promise<LigneSeance[]> {
    if (lignes.length === 0) return [];
    const ids = lignes.map((l) => l.id);
    const publics = await tx
      .select()
      .from(seancePublic)
      .where(and(inArray(seancePublic.seanceId, ids), isNull(seancePublic.deletedAt)));
    const intervenants = await tx
      .select({ seanceId: seanceIntervenant.seanceId, personneId: seanceIntervenant.personneId })
      .from(seanceIntervenant)
      .where(and(inArray(seanceIntervenant.seanceId, ids), isNull(seanceIntervenant.deletedAt)));
    return lignes.map((l) => {
      const siens = publics.filter((p) => p.seanceId === l.id);
      return {
        ...l,
        promotionIds: siens.flatMap((p) => (p.promotionId ? [p.promotionId] : [])).sort(),
        groupeIds: siens.flatMap((p) => (p.groupeId ? [p.groupeId] : [])).sort(),
        intervenantIds: intervenants
          .filter((i) => i.seanceId === l.id)
          .map((i) => i.personneId)
          .sort(),
      };
    });
  }

  /** RG-04-06 : forçages enregistrés, par séance. */
  async forcages(tx: Transaction, seanceIds: readonly string[]): Promise<Map<string, Forcage[]>> {
    const parSeance = new Map<string, Forcage[]>();
    if (seanceIds.length === 0) return parSeance;
    const lignes = await tx
      .select()
      .from(seanceForcage)
      .where(and(inArray(seanceForcage.seanceId, [...seanceIds]), isNull(seanceForcage.deletedAt)));
    for (const l of lignes) {
      const liste = parSeance.get(l.seanceId) ?? [];
      liste.push({ code: l.code, seanceId: l.autreSeanceId, motif: l.motif });
      parSeance.set(l.seanceId, liste);
    }
    return parSeance;
  }

  async charger(tx: Transaction, fenetre: FenetreContexte): Promise<ContexteConflits> {
    const premierJour = jourLocal(fenetre.debut, fenetre.fuseau);
    const dernierJour = jourLocal(new Date(fenetre.fin.getTime() - 1), fenetre.fuseau);
    const periode = and(lt(seance.debut, fenetre.fin), gt(seance.fin, fenetre.debut));
    const seances = await this.seances(
      tx,
      fenetre.moduleIds.length > 0
        ? or(periode, inArray(seance.moduleId, [...fenetre.moduleIds]))
        : periode,
    );
    const publicIds = new Set(fenetre.publicIds);
    for (const s of seances)
      if (s.debut < fenetre.fin && s.fin > fenetre.debut)
        for (const id of [...s.promotionIds, ...s.groupeIds]) publicIds.add(id);
    const { apprenantsParGroupe, inscriptions } = await this.apprenants(
      tx,
      [...publicIds],
      premierJour,
      dernierJour,
    );
    const personnes = [...new Set(inscriptions.map((i) => i.personneId))];
    const intervenantIds = new Set(fenetre.intervenantIds);
    for (const s of seances)
      if (s.debut < fenetre.fin && s.fin > fenetre.debut)
        for (const id of s.intervenantIds) intervenantIds.add(id);
    return {
      fuseau: fenetre.fuseau,
      seances: seances.map(versPlanifiee),
      apprenantsParGroupe,
      salles: await this.salles(tx, fenetre.etablissementId),
      fermetures: await this.fermetures(tx, fenetre.etablissementId, premierJour, dernierJour),
      joursEntreprise: await this.joursEntreprise(tx, inscriptions, premierJour, dernierJour),
      stages: await this.stages(tx, personnes, premierJour, dernierJour),
      ...(await this.disponibilites(tx, [...intervenantIds], fenetre.debut, fenetre.fin)),
      volumesModules: await this.volumes(tx, fenetre.moduleIds),
    };
  }

  /**
   * Apprenants des promotions et groupes, inscrits (hors pré-inscriptions) ou membres du groupe à
   * un moment de la période : un changement en cours de période ne cache aucun conflit.
   */
  async apprenants(tx: Transaction, publicIds: readonly string[], debut: string, fin: string) {
    const apprenantsParGroupe: Record<string, string[]> = {};
    const inscriptions: { id: string; personneId: string }[] = [];
    if (publicIds.length === 0) return { apprenantsParGroupe, inscriptions };
    const active = and(
      isNull(inscription.deletedAt),
      ne(inscription.etat, 'preinscrit'),
      lte(inscription.dateEntree, fin),
      or(isNull(inscription.dateSortie), gt(inscription.dateSortie, debut)),
    );
    const parPromotion = await tx
      .select({
        cle: inscription.promotionId,
        id: inscription.id,
        personneId: inscription.personneId,
      })
      .from(inscription)
      .where(and(active, inArray(inscription.promotionId, [...publicIds])));
    const parGroupe = await tx
      .select({
        cle: groupeMembre.groupeId,
        id: inscription.id,
        personneId: inscription.personneId,
      })
      .from(groupeMembre)
      .innerJoin(inscription, eq(inscription.id, groupeMembre.inscriptionId))
      .where(
        and(
          active,
          inArray(groupeMembre.groupeId, [...publicIds]),
          isNull(groupeMembre.deletedAt),
          lte(groupeMembre.debut, fin),
          or(isNull(groupeMembre.fin), gt(groupeMembre.fin, debut)),
        ),
      );
    for (const l of [...parPromotion, ...parGroupe]) {
      const liste = (apprenantsParGroupe[l.cle] ??= []);
      if (!liste.includes(l.personneId)) liste.push(l.personneId);
      if (!inscriptions.some((i) => i.id === l.id))
        inscriptions.push({ id: l.id, personneId: l.personneId });
    }
    return { apprenantsParGroupe, inscriptions };
  }

  private async salles(tx: Transaction, etablissementId: string) {
    const lignes = await tx
      .select()
      .from(salle)
      .where(and(eq(salle.etablissementId, etablissementId), isNull(salle.deletedAt)));
    return Object.fromEntries(
      lignes.map((s) => [
        s.id,
        {
          id: s.id,
          type: s.type,
          capacite: s.capacite,
          equipements: s.equipements,
          statut: s.statut,
        },
      ]),
    );
  }

  /** Fermetures de l'établissement (RG-01-04 : sans établissement listé, pour tous) et fériés. */
  async fermetures(
    tx: Transaction,
    etablissementId: string,
    debut: string,
    fin: string,
  ): Promise<Fermeture[]> {
    const lignes = await tx
      .select()
      .from(fermeture)
      .where(
        and(
          isNull(fermeture.deletedAt),
          lte(fermeture.dateDebut, fin),
          gte(fermeture.dateFin, debut),
        ),
      );
    const cibles =
      lignes.length === 0
        ? []
        : await tx
            .select()
            .from(fermetureEtablissement)
            .where(
              and(
                inArray(
                  fermetureEtablissement.fermetureId,
                  lignes.map((f) => f.id),
                ),
                isNull(fermetureEtablissement.deletedAt),
              ),
            );
    const applicables = lignes.filter((f) => {
      const siennes = cibles.filter((c) => c.fermetureId === f.id);
      return siennes.length === 0 || siennes.some((c) => c.etablissementId === etablissementId);
    });
    const feries: Fermeture[] = [];
    for (let annee = Number(debut.slice(0, 4)); annee <= Number(fin.slice(0, 4)); annee++)
      for (const { date, libelle } of joursFeriesNationauxDe(annee))
        if (date >= debut && date <= fin) feries.push({ dateDebut: date, dateFin: date, libelle });
    return [
      ...applicables.map((f) => ({
        dateDebut: f.dateDebut,
        dateFin: f.dateFin,
        libelle: f.libelle,
      })),
      ...feries,
    ];
  }

  /** RG-04-18 : créneaux de disponibilité et indisponibilités des intervenants sur la période. */
  async disponibilites(
    tx: Transaction,
    intervenantIds: readonly string[],
    debut: Date,
    fin: Date,
  ): Promise<Pick<ContexteConflits, 'disponibilites' | 'indisponibilites'>> {
    if (intervenantIds.length === 0) return { disponibilites: [], indisponibilites: [] };
    const creneaux = await tx
      .select()
      .from(disponibiliteIntervenant)
      .where(
        and(
          inArray(disponibiliteIntervenant.personneId, [...intervenantIds]),
          isNull(disponibiliteIntervenant.deletedAt),
        ),
      )
      .orderBy(asc(disponibiliteIntervenant.jourSemaine), asc(disponibiliteIntervenant.heureDebut));
    const ponctuelles = await tx
      .select()
      .from(indisponibiliteIntervenant)
      .where(
        and(
          inArray(indisponibiliteIntervenant.personneId, [...intervenantIds]),
          isNull(indisponibiliteIntervenant.deletedAt),
          lt(indisponibiliteIntervenant.debut, fin),
          gt(indisponibiliteIntervenant.fin, debut),
        ),
      )
      .orderBy(asc(indisponibiliteIntervenant.debut));
    return {
      disponibilites: creneaux.map((c) => ({
        intervenantId: c.personneId,
        jourSemaine: c.jourSemaine,
        heureDebut: c.heureDebut.slice(0, 5),
        heureFin: c.heureFin.slice(0, 5),
      })),
      indisponibilites: ponctuelles.map((i) => ({
        intervenantId: i.personneId,
        debut: i.debut,
        fin: i.fin,
      })),
    };
  }

  /** RG-03-13 : jours en entreprise de chaque apprenant, d'après son rythme et ses exceptions. */
  async joursEntreprise(
    tx: Transaction,
    inscriptions: readonly { id: string; personneId: string }[],
    debut: string,
    fin: string,
  ): Promise<Record<string, string[]>> {
    const typeDuJour = await this.rythmes.typeDuJourPour(
      tx,
      inscriptions.map((i) => i.id),
    );
    const jours = joursEntre(debut, fin);
    const resultat: Record<string, string[]> = {};
    for (const i of inscriptions) {
      const type = typeDuJour.get(i.id);
      if (!type) continue;
      const siens = (resultat[i.personneId] ??= []);
      for (const jour of jours)
        if (type(jour) === 'entreprise' && !siens.includes(jour)) siens.push(jour);
    }
    return resultat;
  }

  /** RG-03-24 : stages conventionnés (signés, en cours ou terminés) qui touchent la période. */
  private async stages(
    tx: Transaction,
    personneIds: readonly string[],
    debut: string,
    fin: string,
  ): Promise<Record<string, Intervalle[]>> {
    const resultat: Record<string, Intervalle[]> = {};
    if (personneIds.length === 0) return resultat;
    const lignes = await tx
      .select()
      .from(conventionStage)
      .where(
        and(
          isNull(conventionStage.deletedAt),
          inArray(conventionStage.personneId, [...personneIds]),
          inArray(conventionStage.statut, [...STAGES]),
          lte(conventionStage.debut, fin),
          gte(conventionStage.fin, debut),
        ),
      );
    for (const l of lignes)
      (resultat[l.personneId] ??= []).push({ dateDebut: l.debut, dateFin: l.fin });
    return resultat;
  }

  /** Volumes de la maquette en minutes ; un type sans heures prévues est aussi suivi. */
  private async volumes(tx: Transaction, moduleIds: readonly string[]) {
    if (moduleIds.length === 0) return {};
    const lignes = await tx
      .select()
      .from(maquetteModule)
      .where(inArray(maquetteModule.id, [...moduleIds]));
    return Object.fromEntries(lignes.map((m) => [m.id, volumeEnMinutes(m)]));
  }
}
