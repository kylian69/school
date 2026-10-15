import { decompteAssiduite, type AbsenceEnregistree } from './absences.js';

/**
 * Seuils et alertes d'assiduité (I4.4 ; RG-06-23, RG-03-20) : demi-journées non justifiées sur une
 * période glissante. Valeurs de l'établissement (pas des règles légales) : réglées par l'école,
 * surchargeables par formation, avec les valeurs par défaut du cahier des charges.
 */
export interface SeuilsAssiduite {
  /** Niveau 1 : alerte à la scolarité et au référent (RG-03-20). */
  niveau1: number;
  /** Niveau 2 : alerte à la direction (RG-06-23). */
  niveau2: number;
  /** Période glissante, en jours, aujourd'hui compris. */
  fenetreJours: number;
}

export type NiveauAlerte = 1 | 2;

/** RG-06-23 : 3 puis 6 demi-journées non justifiées sur 30 jours glissants. */
export const SEUILS_ASSIDUITE_DEFAUT: SeuilsAssiduite = {
  niveau1: 3,
  niveau2: 6,
  fenetreJours: 30,
};

/** Bornes de saisie : au moins une demi-journée, période d'une semaine à un an. */
export const BORNES_SEUILS_ASSIDUITE = {
  demiJournees: { min: 1, max: 100 },
  fenetreJours: { min: 7, max: 365 },
} as const;

/** Seuils cohérents : dans les bornes, et le niveau 2 au-dessus du niveau 1. */
export function seuilsValides(s: SeuilsAssiduite): boolean {
  const { demiJournees: d, fenetreJours: f } = BORNES_SEUILS_ASSIDUITE;
  const entier = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  return (
    entier(s.niveau1, d.min, d.max) &&
    entier(s.niveau2, d.min, d.max) &&
    entier(s.fenetreJours, f.min, f.max) &&
    s.niveau1 < s.niveau2
  );
}

/**
 * RG-06-23 : seuils d'un apprenant. Ceux de ses formations priment sur ceux de l'école, eux-mêmes
 * sur les valeurs par défaut. Inscrit dans plusieurs formations qui en définissent, il relève des
 * plus exigeants : niveau 1 le plus bas, puis niveau 2 le plus bas, puis période la plus longue.
 */
export function seuilsApplicables(
  ecole: SeuilsAssiduite | null,
  formations: readonly (SeuilsAssiduite | null)[],
): SeuilsAssiduite {
  const propres = formations.filter((s): s is SeuilsAssiduite => s !== null);
  if (propres.length === 0) return ecole ?? SEUILS_ASSIDUITE_DEFAUT;
  return [...propres].sort(
    (a, b) => a.niveau1 - b.niveau1 || a.niveau2 - b.niveau2 || b.fenetreJours - a.fenetreJours,
  )[0] as SeuilsAssiduite;
}

const JOUR = 86_400_000;

/** Premier jour (AAAA-MM-JJ) de la période glissante qui finit `aujourdhui`. */
export function debutFenetre(aujourdhui: string, fenetreJours: number): string {
  const fin = Date.parse(`${aujourdhui}T00:00:00Z`);
  return new Date(fin - (fenetreJours - 1) * JOUR).toISOString().slice(0, 10);
}

/** Niveau atteint par un nombre de demi-journées non justifiées (0 : sous les seuils). */
export function niveauAtteint(demiJournees: number, s: SeuilsAssiduite): 0 | NiveauAlerte {
  if (demiJournees >= s.niveau2) return 2;
  if (demiJournees >= s.niveau1) return 1;
  return 0;
}

export interface EvaluationAssiduite {
  /** Période glissante retenue, bornes comprises. */
  du: string;
  au: string;
  demiJourneesNonJustifiees: number;
  niveau: 0 | NiveauAlerte;
}

/**
 * RG-06-23 : demi-journées non justifiées de l'apprenant sur la période glissante qui finit
 * `aujourdhui` (jours locaux des séances), et niveau atteint. Les retards ne comptent pas.
 */
export function evaluerAssiduite(
  absences: readonly (AbsenceEnregistree & { jour: string })[],
  s: SeuilsAssiduite,
  aujourdhui: string,
): EvaluationAssiduite {
  const du = debutFenetre(aujourdhui, s.fenetreJours);
  const retenues = absences.filter((a) => a.jour >= du && a.jour <= aujourdhui);
  const { demiJourneesNonJustifiees } = decompteAssiduite(retenues);
  return {
    du,
    au: aujourdhui,
    demiJourneesNonJustifiees,
    niveau: niveauAtteint(demiJourneesNonJustifiees, s),
  };
}

/**
 * RG-06-23, sans rafale : niveaux à alerter. Chaque niveau atteint (le niveau 2 passe aussi par le
 * niveau 1) est alerté au plus une fois par période glissante : une alerte du même niveau émise
 * pendant la période suffit, même si les absences continuent. Rejouer le calcul ne double rien.
 */
export function alertesADeclencher(
  niveau: 0 | NiveauAlerte,
  emises: readonly { niveau: number; declencheeLe: Date }[],
  maintenant: Date,
  fenetreJours: number,
): NiveauAlerte[] {
  const limite = maintenant.getTime() - fenetreJours * JOUR;
  const niveaux: NiveauAlerte[] = [];
  for (const n of [1, 2] as const) {
    if (n > niveau) break;
    const recente = emises.some((e) => e.niveau === n && e.declencheeLe.getTime() > limite);
    if (!recente) niveaux.push(n);
  }
  return niveaux;
}
