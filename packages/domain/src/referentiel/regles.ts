/**
 * Règles de validation et de compensation d'une version de maquette (RG-02-07, RG-02-08,
 * RG-02-24, RG-02-25) et règles de notes particulières de l'école (RG-02-26 à RG-02-28). Les
 * valeurs par défaut sont celles du cahier des charges, modifiables par formation : ce ne sont pas
 * des valeurs légales.
 */
export const MODES_VALIDATION = ['lmd', 'blocs', 'sans_compensation'] as const;
export type ModeValidationFormation = (typeof MODES_VALIDATION)[number];

export const MODES_EVALUATION = ['notes', 'competences', 'les_deux'] as const;
export type ModeEvaluation = (typeof MODES_EVALUATION)[number];

export const REGLES_NIVEAU = ['derniere', 'meilleur', 'frequent'] as const;
export type RegleNiveau = (typeof REGLES_NIVEAU)[number];

export const METHODES_ARRONDI = ['plus_proche', 'inferieur', 'superieur'] as const;
export type MethodeArrondi = (typeof METHODES_ARRONDI)[number];

export interface Mention {
  libelle: string;
  /** Moyenne minimale, sur 20. */
  seuil: number;
}

export interface ReglesValidation {
  mode: ModeValidationFormation;
  /** Seuil de validation, sur 20. */
  seuil: number;
  /** Note de module sous laquelle l'UE ou le bloc ne peut plus être compensé ; null : aucune. */
  noteEliminatoire: number | null;
  /** Les modules se compensent dans l'UE. */
  compensationModules: boolean;
  /** LMD : compensation entre les semestres d'une même année. */
  compensationSemestres: boolean;
  arrondi: { decimales: number; methode: MethodeArrondi };
  mentions: Mention[];
  /** RG-02-24 : ce sur quoi portent les évaluations. */
  modeEvaluation: ModeEvaluation;
  /** RG-02-24 : comment un bloc se valide. */
  validationBlocs: ModeEvaluation;
  /** RG-02-25 : niveau retenu pour une compétence évaluée plusieurs fois. */
  regleNiveau: RegleNiveau;
}

/** RG-02-08 : valeurs par défaut d'une nouvelle version de maquette. */
export const REGLES_VALIDATION_PAR_DEFAUT: ReglesValidation = {
  mode: 'lmd',
  seuil: 10,
  noteEliminatoire: null,
  compensationModules: true,
  compensationSemestres: false,
  arrondi: { decimales: 2, methode: 'plus_proche' },
  mentions: [
    { libelle: 'Assez bien', seuil: 12 },
    { libelle: 'Bien', seuil: 14 },
    { libelle: 'Très bien', seuil: 16 },
  ],
  modeEvaluation: 'notes',
  validationBlocs: 'notes',
  regleNiveau: 'derniere',
};

/** Cible d'un bonus ou de points de jury : la moyenne générale, une UE ou un module. */
export type CibleRegle =
  { niveau: 'generale' } | { niveau: 'ue'; id: string } | { niveau: 'module'; id: string };

/** RG-02-26 : les six types de règles particulières et leurs paramètres. */
export type RegleParticuliere =
  | {
      type: 'bonus';
      /** Points ajoutés (négatifs pour un malus), ou pourcentage de la moyenne. */
      valeur: number;
      unite: 'points' | 'pourcentage';
      cible: CibleRegle;
      /** Valeur maximale de la cible après le bonus ; 20 si absent. */
      plafond: number | null;
      /** Vrai : pour tous les apprenants ; faux : pour ceux à qui il est accordé. */
      automatique: boolean;
    }
  | {
      type: 'ue_bonus';
      /**
       * UE ou module bonus, retiré des moyennes ordinaires ; null dans la bibliothèque de l'école,
       * choisi à l'activation dans une version.
       */
      source: { niveau: 'ue' | 'module'; id: string } | null;
      /** Seuls les points au-dessus du seuil comptent… */
      seuil: number;
      /** … divisés par ce nombre. */
      diviseur: number;
      cible: CibleRegle;
    }
  | {
      type: 'points_jury';
      /** Points au plus par apprenant et par cible. */
      maximum: number;
      /** Seuils que les points servent à atteindre ; vide : tout seuil. */
      seuils: number[];
    }
  | {
      type: 'plafond';
      /** Type d'évaluation concerné (ex. « rattrapage »). */
      typeEvaluation: string;
      sens: 'plafond' | 'plancher';
      valeur: number;
    }
  | {
      type: 'ponderation';
      /** Poids de chaque type d'évaluation dans la moyenne du module. */
      poids: { typeEvaluation: string; poids: number }[];
    }
  | {
      type: 'penalite_absence';
      typeAbsence: 'injustifiee' | 'justifiee';
      /** Note attribuée à l'évaluation manquée. */
      note: number;
    };

export type TypeRegleParticuliere = RegleParticuliere['type'];

/** RG-02-27 : ordre fixe d'application, affiché tel quel. */
export const ORDRE_REGLES: readonly TypeRegleParticuliere[] = [
  'ponderation',
  'plafond',
  'penalite_absence',
  'ue_bonus',
  'bonus',
  'points_jury',
];

/** Règle activée dans une version : ses paramètres sont figés avec la version (RG-02-28). */
export interface RegleActivee {
  id: string;
  libelle: string;
  regle: RegleParticuliere;
}

export const trierRegles = <T extends { regle: RegleParticuliere }>(regles: readonly T[]): T[] =>
  [...regles].sort(
    (a, b) => ORDRE_REGLES.indexOf(a.regle.type) - ORDRE_REGLES.indexOf(b.regle.type),
  );

export type RefusRegles =
  | 'competences-sans-blocs'
  | 'validation-blocs-sans-competences'
  | 'validation-blocs-sans-notes'
  | 'eliminatoire-au-dessus-du-seuil';

/**
 * Cohérence des règles d'une version (RG-02-24) : une formation évaluée par compétences seules se
 * valide par blocs ; un bloc ne se valide pas par ce que la formation n'évalue pas ; une note
 * éliminatoire reste sous le seuil de validation.
 */
export function verifierReglesValidation(
  regles: ReglesValidation,
): { ok: true } | { ok: false; refus: RefusRegles } {
  if (regles.modeEvaluation === 'competences' && regles.mode !== 'blocs') {
    return { ok: false, refus: 'competences-sans-blocs' };
  }
  if (regles.modeEvaluation === 'notes' && regles.validationBlocs !== 'notes') {
    return { ok: false, refus: 'validation-blocs-sans-competences' };
  }
  if (regles.modeEvaluation === 'competences' && regles.validationBlocs !== 'competences') {
    return { ok: false, refus: 'validation-blocs-sans-notes' };
  }
  if (regles.noteEliminatoire !== null && regles.noteEliminatoire >= regles.seuil) {
    return { ok: false, refus: 'eliminatoire-au-dessus-du-seuil' };
  }
  return { ok: true };
}

/** Arrondi d'une moyenne selon la règle de la formation (RG-02-08). */
export function arrondir(valeur: number, arrondi: ReglesValidation['arrondi']): number {
  const facteur = 10 ** arrondi.decimales;
  // Le décalage minime absorbe les erreurs de représentation binaire (12,345 × 100 = 1234,4999…).
  const decale = valeur * facteur;
  const epsilon = 1e-9;
  const entier =
    arrondi.methode === 'inferieur'
      ? Math.floor(decale + epsilon)
      : arrondi.methode === 'superieur'
        ? Math.ceil(decale - epsilon)
        : Math.round(decale + epsilon);
  return entier / facteur;
}

/** Mention obtenue avec une moyenne : la plus haute dont le seuil est atteint. */
export function mentionPour(moyenne: number, mentions: readonly Mention[]): string | null {
  const atteintes = mentions.filter((m) => moyenne >= m.seuil).sort((a, b) => b.seuil - a.seuil);
  return atteintes[0]?.libelle ?? null;
}
