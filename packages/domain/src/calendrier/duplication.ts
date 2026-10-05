import type { Intervalle } from './annee.js';

/**
 * Duplication d'une année (US-01-04 ; RG-01-05) : périodes et fermetures décalées d'un an, à
 * vérifier avant validation. Les inscriptions ne sont jamais copiées.
 */

/** Même jour l'année suivante ; le 29 février devient le 28. */
export function anneeSuivante(jour: string): string {
  const annee = Number(jour.slice(0, 4)) + 1;
  const moisJour = jour.slice(5);
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  return `${String(annee)}-${moisJour === '02-29' && !bissextile ? '02-28' : moisJour}`;
}

/** Libellé de l'année suivante : chaque millésime avance d'un an (« 2026-2027 » → « 2027-2028 »). */
export const libelleSuivant = (libelle: string) =>
  libelle.replace(/\b(19|20)\d{2}\b/g, (millesime) => String(Number(millesime) + 1));

export function decalerDUnAn<T extends Intervalle>(element: T): T {
  return {
    ...element,
    dateDebut: anneeSuivante(element.dateDebut),
    dateFin: anneeSuivante(element.dateFin),
  };
}

export function proposerDuplication<
  P extends Intervalle & { libelle: string },
  F extends Intervalle & { libelle: string },
>(annee: Intervalle & { libelle: string; periodes: readonly P[]; fermetures: readonly F[] }) {
  return {
    ...decalerDUnAn({ dateDebut: annee.dateDebut, dateFin: annee.dateFin }),
    libelle: libelleSuivant(annee.libelle),
    periodes: annee.periodes.map(decalerDUnAn),
    fermetures: annee.fermetures.map(decalerDUnAn),
  };
}
