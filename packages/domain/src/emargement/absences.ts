import { instantLocal } from '../emploi-du-temps/recurrence.js';
import { jourLocal } from '../emploi-du-temps/conflits.js';
import type { StatutAppel } from './appel-manuel.js';

/**
 * Retards et absences (I4.4 ; RG-06-16 à RG-06-18) : calculés à partir de la dernière version
 * validée de l'appel (RG-06-13), jamais sur le chemin du scan. Une absence naît « non justifiée » ;
 * la justification (RG-06-21) est une couche ajoutée, qui ne modifie pas la feuille signée.
 */
export type NatureAbsence = 'absence' | 'retard';
export const NATURES_ABSENCE = ['absence', 'retard'] as const satisfies readonly NatureAbsence[];

/** Statut de justification ; les justificatifs (lot suivant) ajouteront les leurs. */
export type StatutAbsence = 'non-justifiee';
export const STATUTS_ABSENCE = ['non-justifiee'] as const satisfies readonly StatutAbsence[];

/** Séance vue par le calcul : horaires, fuseau et limite matin / après-midi de l'établissement. */
export interface CadreAbsence {
  debut: Date;
  fin: Date;
  fuseau: string;
  /** RG-04-02 : limite matin / après-midi, HH:MM en heure locale. */
  limiteMidi: string;
}

/** RG-06-18 : jour local de la séance et demi-journées qu'elle touche. */
export interface DemiJournees {
  jour: string;
  matin: boolean;
  apresMidi: boolean;
}

/** Ligne de la liste validée retenue par le calcul (LigneFeuille). */
export interface LigneAbsence {
  personneId: string;
  statut: StatutAppel;
  minutesRetard: number | null;
  nonAttendu: boolean;
}

export interface AbsenceCalculee extends DemiJournees {
  personneId: string;
  nature: NatureAbsence;
  /** Durée manquée : la séance entière pour une absence, les minutes de retard sinon. */
  minutes: number;
}

const MINUTE = 60_000;

const dureeMinutes = (c: { debut: Date; fin: Date }) =>
  Math.ceil((c.fin.getTime() - c.debut.getTime()) / MINUTE);

/**
 * RG-06-18, RG-04-02 : demi-journées touchées par une séance. Le matin finit à la limite de
 * l'établissement : une séance qui la chevauche (une journée) touche le matin et l'après-midi.
 * Le jour est celui du début de la séance, dans le fuseau de l'établissement.
 */
export function demiJourneesDeSeance(c: CadreAbsence): DemiJournees {
  const jour = jourLocal(c.debut, c.fuseau);
  const limite = instantLocal(jour, c.limiteMidi, c.fuseau).getTime();
  return { jour, matin: c.debut.getTime() < limite, apresMidi: c.fin.getTime() > limite };
}

/**
 * RG-06-16 à RG-06-18 : absences et retards d'un appel validé. Un attendu marqué absent, ou jamais
 * scanné ni marqué (« en attente » à la validation), est absent à toute la séance ; un retard
 * manque ses minutes, sur la demi-journée où commence la séance. Un scan à vérifier sans décision
 * compte comme présent (RG-06-11) ; un apprenant non attendu ajouté n'a ni absence ni retard.
 */
export function absencesDeLAppel(
  c: CadreAbsence,
  liste: readonly LigneAbsence[],
): AbsenceCalculee[] {
  const demi = demiJourneesDeSeance(c);
  const duree = dureeMinutes(c);
  const resultat: AbsenceCalculee[] = [];
  for (const l of liste) {
    if (l.nonAttendu) continue;
    const retard = l.statut === 'retard' ? (l.minutesRetard ?? 0) : 0;
    if (l.statut === 'absent' || l.statut === 'en-attente') {
      resultat.push({ personneId: l.personneId, nature: 'absence', minutes: duree, ...demi });
    } else if (retard > 0) {
      resultat.push({
        personneId: l.personneId,
        nature: 'retard',
        minutes: Math.min(retard, duree),
        jour: demi.jour,
        matin: demi.matin,
        apresMidi: !demi.matin,
      });
    }
  }
  return resultat;
}

/** Absence enregistrée, telle que le décompte la lit. */
export interface AbsenceEnregistree extends DemiJournees {
  nature: NatureAbsence;
  minutes: number;
  statut: StatutAbsence;
}

/** Décompte d'assiduité d'un apprenant (E-06-04, E-06-07) ; utile au suivi des alternants. */
export interface DecompteAssiduite {
  absences: number;
  retards: number;
  minutesAbsence: number;
  minutesRetard: number;
  /** RG-06-18 : demi-journées où l'apprenant a manqué au moins une séance attendue. */
  demiJournees: number;
  /** Demi-journées dont au moins une absence n'est pas justifiée (seuils, RG-06-23). */
  demiJourneesNonJustifiees: number;
}

/**
 * RG-06-18 : l'assiduité se compte en heures et en demi-journées. Un retard n'est pas une
 * demi-journée d'absence ; ses minutes sont comptées à part (déduites au prorata, RG-03-15).
 */
export function decompteAssiduite(absences: readonly AbsenceEnregistree[]): DecompteAssiduite {
  const toutes = new Set<string>();
  const nonJustifiees = new Set<string>();
  const d: DecompteAssiduite = {
    absences: 0,
    retards: 0,
    minutesAbsence: 0,
    minutesRetard: 0,
    demiJournees: 0,
    demiJourneesNonJustifiees: 0,
  };
  for (const a of absences) {
    if (a.nature === 'retard') {
      d.retards += 1;
      d.minutesRetard += a.minutes;
      continue;
    }
    d.absences += 1;
    d.minutesAbsence += a.minutes;
    const cles = [a.matin && `${a.jour} matin`, a.apresMidi && `${a.jour} apres-midi`];
    for (const cle of cles) {
      if (!cle) continue;
      toutes.add(cle);
      if (a.statut === 'non-justifiee') nonJustifiees.add(cle);
    }
  }
  d.demiJournees = toutes.size;
  d.demiJourneesNonJustifiees = nonJustifiees.size;
  return d;
}

/** Ce qu'il faut écrire pour passer des absences enregistrées d'une séance au nouveau calcul. */
export interface ChangementsAbsences<T> {
  ajouts: AbsenceCalculee[];
  /** Absences gardées (leur statut de justification aussi) dont la nature ou la durée change. */
  modifications: { avant: T; apres: AbsenceCalculee }[];
  retraits: T[];
}

/**
 * Une correction de l'appel (RG-06-15) recalcule la séance : une absence qui reste garde son
 * statut, une présence retire l'absence, un nouvel absent en ajoute une.
 */
export function changementsAbsences<
  T extends { personneId: string } & Omit<AbsenceCalculee, 'personneId'>,
>(enregistrees: readonly T[], calculees: readonly AbsenceCalculee[]): ChangementsAbsences<T> {
  const parPersonne = new Map(enregistrees.map((a) => [a.personneId, a]));
  const changements: ChangementsAbsences<T> = { ajouts: [], modifications: [], retraits: [] };
  for (const apres of calculees) {
    const avant = parPersonne.get(apres.personneId);
    parPersonne.delete(apres.personneId);
    if (!avant) changements.ajouts.push(apres);
    else if (
      avant.nature !== apres.nature ||
      avant.minutes !== apres.minutes ||
      avant.jour !== apres.jour ||
      avant.matin !== apres.matin ||
      avant.apresMidi !== apres.apresMidi
    )
      changements.modifications.push({ avant, apres });
  }
  changements.retraits = [...parPersonne.values()];
  return changements;
}

/** Statuts d'apprenant en alternance (module 03) : leur décompte sert au suivi (RG-03-15). */
export const STATUTS_ALTERNANT = [
  'apprenti',
  'apprenti_sans_employeur',
  'professionnalisation',
] as const;

export const estAlternant = (statut: string | null | undefined) =>
  statut !== null &&
  statut !== undefined &&
  (STATUTS_ALTERNANT as readonly string[]).includes(statut);
