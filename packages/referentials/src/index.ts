import type { DatedTable } from './dated-table.js';
import { contrasteMinimal } from './tables/accessibilite.js';
import { ectsParSemestre } from './tables/ects.js';
import { dureesConservation } from './tables/durees-conservation.js';
import { modulesParFormule } from './tables/formules.js';
import { joursFeriesNationaux } from './tables/jours-feries.js';

export * from './dated-table.js';
export * from './tables/accessibilite.js';
export * from './tables/durees-conservation.js';
export * from './tables/ects.js';
export * from './tables/formules.js';
export * from './tables/jours-feries.js';

/** Toutes les tables livrées, validées par la CI. */
export const REFERENTIALS: readonly DatedTable<unknown>[] = [
  joursFeriesNationaux,
  dureesConservation,
  modulesParFormule,
  contrasteMinimal,
  ectsParSemestre,
];
export * from './mots-de-passe-compromis.js';
