import { REGLES_SCAN_PAR_DEFAUT, type ReglesScan } from './fenetre-scan.js';
import { localisationAVerifier, type ResultatLocalisation } from './localisation.js';

/**
 * Appel manuel (US-06-04, US-06-05 ; RG-06-11, RG-06-12) : l'intervenant marque chaque attendu
 * présent, en retard (minutes) ou absent, qu'il ait scanné ou non. Sa décision l'emporte sur le
 * scan, qui reste conservé tel quel comme preuve.
 */
export type StatutMarque = 'present' | 'retard' | 'absent';

/** Statut d'un attendu dans la liste d'appel, tel que l'intervenant le voit. */
export type StatutAppel = StatutMarque | 'a-verifier' | 'en-attente';

export interface ScanAppel {
  rejoue: boolean;
  localisation: ResultatLocalisation | null;
  /** RG-06-02 : minutes de retard enregistrées au scan (absent ou 0 : à l'heure). */
  retardMinutes?: number | null;
}

export interface MarquageAppel {
  statut: StatutMarque;
  minutesRetard: number | null;
}

/** RG-06-01 : l'appel est verrouillé 7 jours après la séance. */
export const VERROUILLAGE_APPEL_JOURS = 7;

const MINUTE = 60_000;

/**
 * Statut d'un attendu : la décision de l'intervenant d'abord ; sinon un scan rejoué hors ligne ou
 * hors du périmètre est « à vérifier » (RG-00-19, RG-06-11) ; sinon le scan vaut présence, en
 * retard s'il est arrivé après la tolérance (RG-06-02).
 */
export function statutDansAppel(
  scan: ScanAppel | null,
  marquage: MarquageAppel | null,
): StatutAppel {
  if (marquage) return marquage.statut;
  if (!scan) return 'en-attente';
  if (scan.rejoue || localisationAVerifier(scan.localisation)) return 'a-verifier';
  return (scan.retardMinutes ?? 0) > 0 ? 'retard' : 'present';
}

/** Minutes de retard d'un attendu : celles de la décision, sinon celles du scan. */
export function minutesDeRetard(
  statut: StatutAppel,
  scan: ScanAppel | null,
  marquage: MarquageAppel | null,
): number | null {
  if (statut !== 'retard') return null;
  return marquage ? marquage.minutesRetard : (scan?.retardMinutes ?? null);
}

/** RG-06-11 : sans décision de l'intervenant, un scan à vérifier compte comme présent. */
export const comptePresent = (statut: StatutAppel) =>
  statut === 'present' || statut === 'retard' || statut === 'a-verifier';

export type RefusMarquage = 'trop-tot' | 'verrouille' | 'retard-invalide';

/**
 * Contrôle d'un marquage : possible dès l'ouverture de la fenêtre de scan (RG-06-02) et jusqu'au
 * verrouillage (RG-06-01), au-delà seulement avec le droit spécifique (RG-06-15, contrôlé par
 * verifierModification) ; un retard porte un nombre entier de minutes, au plus la durée de la
 * séance, et seul un retard en porte. Après validation, voir aussi verifierModification.
 */
export function verifierMarquage(
  seance: { debutMs: number; finMs: number },
  maintenantMs: number,
  marquage: MarquageAppel,
  regles: ReglesScan = REGLES_SCAN_PAR_DEFAUT,
  droitVerrouille = false,
): RefusMarquage | null {
  if (maintenantMs < seance.debutMs - regles.ouvertureAvantMinutes * MINUTE) return 'trop-tot';
  if (
    !droitVerrouille &&
    maintenantMs > seance.finMs + VERROUILLAGE_APPEL_JOURS * 24 * 60 * MINUTE
  ) {
    return 'verrouille';
  }
  if (marquage.statut !== 'retard')
    return marquage.minutesRetard === null ? null : 'retard-invalide';
  const minutes = marquage.minutesRetard;
  const duree = Math.ceil((seance.finMs - seance.debutMs) / MINUTE);
  return minutes !== null && Number.isInteger(minutes) && minutes >= 1 && minutes <= duree
    ? null
    : 'retard-invalide';
}
