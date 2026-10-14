import { REGLES_SCAN_PAR_DEFAUT, type ReglesScan } from './fenetre-scan.js';
import { VERROUILLAGE_APPEL_JOURS, type StatutAppel } from './appel-manuel.js';

/**
 * Cycle de l'appel (RG-06-01) : à venir → ouvert → validé → verrouillé. L'appel s'ouvre avec la
 * fenêtre de scan (RG-06-02) et se verrouille 7 jours après la séance, validé ou non.
 */
export type EtatAppel = 'a-venir' | 'ouvert' | 'valide' | 'verrouille';

/**
 * RG-06-15 : après validation, l'intervenant corrige son appel jusqu'à J+2 (valeur par défaut,
 * paramétrable) ; ensuite seules la scolarité et la pédagogie corrigent, jusqu'au verrouillage.
 */
export const CORRECTION_INTERVENANT_JOURS = 2;

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;

export interface SeanceAppel {
  debutMs: number;
  finMs: number;
}

export function etatAppel(
  seance: SeanceAppel,
  valide: boolean,
  maintenantMs: number,
  regles: ReglesScan = REGLES_SCAN_PAR_DEFAUT,
): EtatAppel {
  if (maintenantMs > seance.finMs + VERROUILLAGE_APPEL_JOURS * JOUR) return 'verrouille';
  if (valide) return 'valide';
  return maintenantMs >= seance.debutMs - regles.ouvertureAvantMinutes * MINUTE
    ? 'ouvert'
    : 'a-venir';
}

export type RefusModification = 'trop-tot' | 'verrouille' | 'delai-intervenant' | 'motif-requis';

/**
 * Peut-on modifier l'appel (marquer, valider) ? Avant validation, oui dès l'ouverture. Après, c'est
 * une correction (RG-06-13, RG-06-15) : un motif est exigé ; l'intervenant corrige jusqu'à J+2
 * après la séance, la scolarité et la pédagogie (gestionnaire) jusqu'au verrouillage. Au-delà, la
 * correction exige un droit spécifique, qui n'existe pas encore : elle est refusée.
 */
export function verifierModification(
  seance: SeanceAppel,
  valide: boolean,
  maintenantMs: number,
  acteur: { gestionnaire: boolean; motif: string | null },
  regles: ReglesScan = REGLES_SCAN_PAR_DEFAUT,
): RefusModification | null {
  const etat = etatAppel(seance, valide, maintenantMs, regles);
  if (etat === 'a-venir') return 'trop-tot';
  if (etat === 'verrouille') return 'verrouille';
  if (etat === 'ouvert') return null;
  if (!acteur.gestionnaire && maintenantMs > seance.finMs + CORRECTION_INTERVENANT_JOURS * JOUR)
    return 'delai-intervenant';
  return acteur.motif?.trim() ? null : 'motif-requis';
}

/** RG-06-11 : raison d'un scan « à vérifier » ; null s'il n'y a rien à vérifier. */
export type RaisonAVerifier = 'rejoue' | 'hors-site' | 'inconnu';

export function raisonAVerifier(scan: {
  rejoue: boolean;
  localisation: 'sur-place' | 'hors-site' | 'inconnu' | null;
}): RaisonAVerifier | null {
  if (scan.localisation === 'hors-site' || scan.localisation === 'inconnu')
    return scan.localisation;
  return scan.rejoue ? 'rejoue' : null;
}

/**
 * RG-06-11 : décision de l'intervenant sur un scan à vérifier : confirmé (présent ou en retard) ou
 * retiré (absent) ; null sans décision (le scan compte alors comme présent).
 */
export type DecisionAVerifier = 'confirme' | 'retire';

export function decisionAVerifier(
  raison: RaisonAVerifier | null,
  marquage: { statut: StatutAppel } | null,
): DecisionAVerifier | null {
  if (!raison || !marquage) return null;
  return marquage.statut === 'absent' ? 'retire' : 'confirme';
}

export interface LigneFeuille {
  personneId: string;
  statut: StatutAppel;
  scanneLe: string | null;
  minutesRetard: number | null;
  aDistance: boolean;
  localisation: string | null;
  raison: RaisonAVerifier | null;
  decision: DecisionAVerifier | null;
  nonAttendu: boolean;
}

/**
 * Forme canonique d'une liste validée (RG-06-13) : lignes triées par fiche, champs dans un ordre
 * fixe. Son hachage est l'empreinte de la feuille ; deux listes identiques ont la même empreinte.
 */
export function listeCanonique(seanceId: string, version: number, lignes: readonly LigneFeuille[]) {
  const triees = [...lignes]
    .sort((a, b) => (a.personneId < b.personneId ? -1 : a.personneId > b.personneId ? 1 : 0))
    .map((l) => [
      l.personneId,
      l.statut,
      l.scanneLe,
      l.minutesRetard,
      l.aDistance,
      l.localisation,
      l.raison,
      l.decision,
      l.nonAttendu,
    ]);
  return JSON.stringify({ seanceId, version, lignes: triees });
}
