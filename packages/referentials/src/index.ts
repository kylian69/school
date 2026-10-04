import type { DatedTable } from './dated-table.js';
import { dureesConservation } from './tables/durees-conservation.js';
import { joursFeriesNationaux } from './tables/jours-feries.js';

export * from './dated-table.js';
export * from './tables/durees-conservation.js';
export * from './tables/jours-feries.js';

/** Toutes les tables livrées, validées par la CI. */
export const REFERENTIALS: readonly DatedTable<unknown>[] = [
  joursFeriesNationaux,
  dureesConservation,
];
