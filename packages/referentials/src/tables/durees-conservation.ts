import type { DatedTable } from '../dated-table.js';

/** Durée de conservation par défaut d'un type de donnée, comptée à partir d'un événement. */
export interface DureeConservation {
  /** Durée ISO 8601 (P5Y = 5 ans, P0D = dès l'événement). */
  duree: string;
  /** Événement de départ ; « fin » : fin de la période décrite par la donnée. */
  apres: 'sortie' | 'creation' | 'fin';
  /** « effacement » : seul le champ sensible est vidé, la ligne reste. */
  echeance: 'suppression' | 'anonymisation' | 'effacement';
}

const SOURCE_CAHIER = 'Cahier des charges Scolaly';
const SOURCE_PILOTE = "Décision de l'établissement / pilote 09/10/2026";

/**
 * Durées de conservation par défaut (RGPD-04), paramétrables par l'école dans les limites
 * légales. Seules figurent les valeurs fixées par le cahier des charges ; les autres types
 * (résultats et diplômes, journal d'audit de l'école…) seront ajoutés après relecture par un
 * juriste ou un DPO (question ouverte du module 00, à trancher avant J7).
 */
export const dureesConservation: DatedTable<DureeConservation> = {
  code: 'durees-conservation',
  libelle: 'Durées de conservation par défaut',
  aValider: true,
  entries: [
    {
      cle: 'dossier-pedagogique',
      debut: '2026-10-01',
      fin: null,
      source: `${SOURCE_CAHIER}, module 00, RGPD-04`,
      valeur: { duree: 'P5Y', apres: 'sortie', echeance: 'anonymisation' },
    },
    {
      cle: 'feuille-emargement',
      debut: '2026-10-01',
      fin: null,
      source: `${SOURCE_CAHIER}, module 06, RG-06-27`,
      valeur: { duree: 'P5Y', apres: 'creation', echeance: 'suppression' },
    },
    {
      cle: 'photo-apprenant',
      debut: '2026-10-01',
      fin: null,
      source: `${SOURCE_CAHIER}, module 01, RG-01-27`,
      valeur: { duree: 'P0D', apres: 'sortie', echeance: 'suppression' },
    },
    {
      cle: 'audit-plateforme',
      debut: '2026-10-01',
      fin: null,
      source: `${SOURCE_CAHIER}, module 19, traçabilité de la console`,
      valeur: { duree: 'P3Y', apres: 'creation', echeance: 'suppression' },
    },
    {
      // RG-04-18 : le motif d'une indisponibilité ne sert plus une fois celle-ci passée.
      cle: 'indisponibilite-intervenant-motif',
      debut: '2026-10-09',
      fin: null,
      source: SOURCE_PILOTE,
      valeur: { duree: 'P0D', apres: 'fin', echeance: 'effacement' },
    },
    {
      // RG-04-18 : l'indisponibilité passée reste un an, pour expliquer un planning récent.
      cle: 'indisponibilite-intervenant',
      debut: '2026-10-09',
      fin: null,
      source: SOURCE_PILOTE,
      valeur: { duree: 'P12M', apres: 'fin', echeance: 'suppression' },
    },
  ],
};
