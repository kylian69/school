import type { DatedTable } from '../dated-table.js';

/** Règle de calcul d'un jour férié : date fixe, ou décalage en jours par rapport à Pâques. */
export type RegleJourFerie =
  | { code: string; libelle: string; type: 'fixe'; mois: number; jour: number }
  | { code: string; libelle: string; type: 'paques'; decalage: number };

/**
 * Jours fériés nationaux (RG-01-04). Les jours propres à l'Alsace-Moselle et aux outre-mer
 * seront ajoutés dans des tables distinctes, appliquées selon l'établissement.
 */
export const joursFeriesNationaux: DatedTable<readonly RegleJourFerie[]> = {
  code: 'jours-feries-nationaux',
  libelle: 'Jours fériés nationaux',
  entries: [
    {
      cle: 'defaut',
      debut: '2008-05-01',
      fin: null,
      source: 'Code du travail, article L3133-1 (version en vigueur depuis le 01/05/2008)',
      valeur: [
        { code: 'jour-de-l-an', libelle: "Jour de l'an", type: 'fixe', mois: 1, jour: 1 },
        { code: 'lundi-de-paques', libelle: 'Lundi de Pâques', type: 'paques', decalage: 1 },
        { code: 'fete-du-travail', libelle: 'Fête du Travail', type: 'fixe', mois: 5, jour: 1 },
        { code: 'victoire-1945', libelle: 'Victoire 1945', type: 'fixe', mois: 5, jour: 8 },
        { code: 'ascension', libelle: 'Ascension', type: 'paques', decalage: 39 },
        { code: 'lundi-de-pentecote', libelle: 'Lundi de Pentecôte', type: 'paques', decalage: 50 },
        { code: 'fete-nationale', libelle: 'Fête nationale', type: 'fixe', mois: 7, jour: 14 },
        { code: 'assomption', libelle: 'Assomption', type: 'fixe', mois: 8, jour: 15 },
        { code: 'toussaint', libelle: 'Toussaint', type: 'fixe', mois: 11, jour: 1 },
        { code: 'armistice-1918', libelle: 'Armistice 1918', type: 'fixe', mois: 11, jour: 11 },
        { code: 'noel', libelle: 'Noël', type: 'fixe', mois: 12, jour: 25 },
      ],
    },
  ],
};
