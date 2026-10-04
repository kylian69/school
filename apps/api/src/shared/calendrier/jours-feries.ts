import { joursFeries, type JourFerie } from '@scolaly/domain';
import { joursFeriesNationaux, valueAt } from '@scolaly/referentials';

/** Jours fériés nationaux d'une année, selon les règles en vigueur au 1er janvier (RG-01-04). */
export function joursFeriesNationauxDe(annee: number): JourFerie[] {
  const { valeur } = valueAt(joursFeriesNationaux, `${annee}-01-01`);
  return joursFeries(annee, valeur);
}
