/** Promotions, groupes, modules, intervenants et salles de l'établissement. */
export interface Referentiels {
  promotions: {
    id: string;
    libelle: string;
    effectif: number;
    groupes: { id: string; libelle: string; effectif: number }[];
    modules: { id: string; libelle: string }[];
  }[];
  intervenants: { id: string; nom: string }[];
  salles: { id: string; nom: string; capacite: number | null; type: string; fermee: boolean }[];
}

/** Public, intervenant ou salle proposés par défaut d'après l'emploi du temps affiché. */
export interface Defaut {
  promotionIds: string[];
  groupeIds: string[];
  intervenantIds: string[];
  salleId: string | null;
}

export interface Droits {
  gerer: boolean;
  /** RG-04-06 : forcer un conflit de salle ou de groupe (permission edt:forcer). */
  forcer: boolean;
}

/** Module et type d'une séance créée depuis la barre des modules à placer. */
export interface ModeleSeance {
  moduleId: string;
  type: 'cm' | 'td' | 'tp' | 'projet' | 'examen';
}

/** Nouvel horaire d'une séance déplacée dans la grille. */
export interface Horaire {
  debut: string;
  fin: string;
}
