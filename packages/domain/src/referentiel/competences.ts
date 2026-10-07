import type { RegleNiveau } from './regles.js';

/**
 * Évaluation par compétences (RG-02-21 à RG-02-25). L'échelle de maîtrise est définie par l'école
 * (RG-02-22) : chaque niveau a un ordre, et les niveaux « validants » (par défaut « acquis » et
 * « expert ») valident la compétence.
 */
export interface NiveauMaitrise {
  id: string;
  libelle: string;
  ordre: number;
  valide: boolean;
}

/** RG-02-22 : échelle par défaut d'une école (couleurs en jetons du système de design). */
export const ECHELLE_PAR_DEFAUT = [
  { libelle: 'Non acquis', couleur: '#DC2626', valeur: 0, valide: false },
  { libelle: 'En cours d’acquisition', couleur: '#D97706', valeur: 1, valide: false },
  { libelle: 'Acquis', couleur: '#16A34A', valeur: 2, valide: true },
  { libelle: 'Expert', couleur: '#4F46E5', valeur: 3, valide: true },
] as const;

export interface EvaluationCompetence {
  niveauId: string;
  /** Date de l'évaluation (AAAA-MM-JJ ou horodatage ISO) : l'ordre alphabétique est celui du temps. */
  date: string;
}

export interface NiveauRetenu {
  niveauId: string | null;
  /** Niveau forcé par le responsable pédagogique (RG-02-25), avec son commentaire. */
  force: boolean;
}

/**
 * RG-02-25 : niveau retenu pour une compétence évaluée plusieurs fois. Un forçage l'emporte. Pour
 * le niveau le plus fréquent, une égalité se tranche par l'évaluation la plus récente.
 */
export function niveauRetenu(
  evaluations: readonly EvaluationCompetence[],
  regle: RegleNiveau,
  echelle: readonly NiveauMaitrise[],
  forcage: string | null = null,
): NiveauRetenu {
  if (forcage) return { niveauId: forcage, force: true };
  const connues = evaluations.filter((e) => echelle.some((n) => n.id === e.niveauId));
  const chronologie = [...connues].sort((a, b) => a.date.localeCompare(b.date));
  const plusRecente = chronologie.at(-1);
  if (!plusRecente) return { niveauId: null, force: false };
  const ordre = (id: string) => echelle.find((n) => n.id === id)?.ordre ?? -1;
  let retenu = plusRecente.niveauId;
  if (regle === 'meilleur') {
    retenu = chronologie.reduce((m, e) => (ordre(e.niveauId) > ordre(m) ? e.niveauId : m), '');
  } else if (regle === 'frequent') {
    const effectifs = new Map<string, number>();
    for (const e of chronologie) effectifs.set(e.niveauId, (effectifs.get(e.niveauId) ?? 0) + 1);
    const maximum = Math.max(...effectifs.values());
    // Du plus récent au plus ancien : le premier niveau au maximum l'emporte.
    retenu = [...chronologie]
      .reverse()
      .reduce((choix, e) => (effectifs.get(choix) === maximum ? choix : e.niveauId), retenu);
  }
  return { niveauId: retenu, force: false };
}

export interface CompetenceBloc {
  id: string;
  code: string;
}

export interface ValidationParCompetences {
  valide: boolean;
  /** Compétences sans niveau validant (non évaluées comprises), pour le relevé (section 7). */
  manquantes: string[];
}

/**
 * RG-02-24 : un bloc est validé par les compétences quand toutes ses compétences atteignent un
 * niveau validant (« acquis » ou plus par défaut). Un bloc sans compétence n'est pas validé ainsi.
 */
export function validerBlocParCompetences(
  competences: readonly CompetenceBloc[],
  niveaux: Readonly<Record<string, string | null>>,
  echelle: readonly NiveauMaitrise[],
): ValidationParCompetences {
  const manquantes = competences
    .filter((c) => {
      const niveau = echelle.find((n) => n.id === niveaux[c.id]);
      return !niveau?.valide;
    })
    .map((c) => c.code);
  return { valide: competences.length > 0 && manquantes.length === 0, manquantes };
}
