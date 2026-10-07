import {
  heuresVides,
  TYPES_HEURES,
  type Heures,
  type TypeHeures,
} from '../referentiel/maquette.js';

/**
 * Affectations des intervenants (RG-02-18) : le total des heures affectées à un module, par type,
 * est comparé au volume de la maquette ; tout écart est signalé.
 */
export interface EcartHeures {
  type: TypeHeures;
  prevu: number;
  affecte: number;
  /** Positif : heures affectées en trop ; négatif : heures restant à affecter. */
  ecart: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function totalAffecte(affectations: readonly { heures: Heures }[]): Heures {
  const total = heuresVides();
  for (const a of affectations) {
    for (const type of TYPES_HEURES) total[type] = arrondi(total[type] + a.heures[type]);
  }
  return total;
}

/** Écarts d'un module, par type d'heures (seuls les types où prévu et affecté diffèrent). */
export function ecartsHeures(
  prevu: Heures,
  affectations: readonly { heures: Heures }[],
): EcartHeures[] {
  const affecte = totalAffecte(affectations);
  return TYPES_HEURES.filter((type) => affecte[type] !== prevu[type]).map((type) => ({
    type,
    prevu: prevu[type],
    affecte: affecte[type],
    ecart: arrondi(affecte[type] - prevu[type]),
  }));
}
