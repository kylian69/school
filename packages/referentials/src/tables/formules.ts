import type { DatedTable } from '../dated-table.js';

/**
 * Modules inclus dans chaque formule (RG-19-04). Grille commerciale, datée comme les tables
 * légales pour garder la trace des versions de l'offre. Les modules 14 à 17 (jurys, devoirs,
 * pilotage, référent handicap) ne sont rattachés à aucune formule par le cahier des charges :
 * ils ne s'ouvrent que par exception, en attendant une décision commerciale.
 */
const ESSENTIEL = [
  'socle',
  'referentiel',
  'alternance',
  'emplois-du-temps',
  'cahier-de-texte',
  'emargement',
  'notes',
  'portails',
] as const;
const PRO = [...ESSENTIEL, 'crm', 'contrats', 'livret', 'facturation', 'qualite'] as const;
const ENTREPRISE = [...PRO, 'api-publique'] as const;

const SOURCE = 'Cahier des charges Scolaly, module 19, RG-19-04 ; étude business, partie 2';

export const modulesParFormule: DatedTable<readonly string[]> = {
  code: 'modules-par-formule',
  libelle: 'Modules inclus dans chaque formule',
  aValider: true,
  entries: [
    { cle: 'essentiel', debut: '2026-10-01', fin: null, source: SOURCE, valeur: ESSENTIEL },
    { cle: 'pro', debut: '2026-10-01', fin: null, source: SOURCE, valeur: PRO },
    { cle: 'entreprise', debut: '2026-10-01', fin: null, source: SOURCE, valeur: ENTREPRISE },
  ],
};
