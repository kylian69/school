import type { TypePerimetre } from './droits.js';

/**
 * Attribution d'un rôle à une personne, avec un périmètre et une période (US-01-09 ; RG-01-14,
 * RG-00-10, RG-00-11). Fin exclue : un rôle retiré aujourd'hui ne s'applique plus aujourd'hui.
 */
export type RefusNouvelleAttribution =
  | 'perimetre-sans-cible'
  | 'perimetre-cible-inattendue'
  | 'perimetre-indisponible'
  | 'dates'
  | 'deja-attribue';

/** Périmètres qui désignent un objet (établissement, formation, promotion). */
const AVEC_CIBLE: readonly TypePerimetre[] = ['etablissement', 'formation', 'promotion'];

export function verifierNouvelleAttribution(options: {
  perimetreType: TypePerimetre;
  perimetreId: string | null;
  debut: string;
  fin: string | null;
  /** Types de périmètre dont les objets existent déjà (les formations arrivent avec le module 02). */
  perimetresDisponibles: readonly TypePerimetre[];
  /** Même rôle, même périmètre, déjà en cours ou à venir sur la période. */
  dejaAttribue: boolean;
}): { ok: true } | { ok: false; refus: RefusNouvelleAttribution } {
  if (!options.perimetresDisponibles.includes(options.perimetreType)) {
    return { ok: false, refus: 'perimetre-indisponible' };
  }
  const avecCible = AVEC_CIBLE.includes(options.perimetreType);
  if (avecCible && !options.perimetreId) return { ok: false, refus: 'perimetre-sans-cible' };
  if (!avecCible && options.perimetreId) return { ok: false, refus: 'perimetre-cible-inattendue' };
  if (options.fin !== null && options.fin <= options.debut) return { ok: false, refus: 'dates' };
  if (options.dejaAttribue) return { ok: false, refus: 'deja-attribue' };
  return { ok: true };
}

/**
 * Retrait d'un rôle à une date : la période se termine ce jour-là, fin exclue. Une attribution
 * qui n'a pas encore commencé, ou commence ce jour-là, est simplement annulée.
 */
export function retraitAttribution(
  attribution: { debut: string; fin: string | null },
  date: string,
): { action: 'terminer'; fin: string } | { action: 'annuler' } | { action: 'deja-terminee' } {
  if (attribution.fin !== null && attribution.fin <= date) return { action: 'deja-terminee' };
  if (attribution.debut >= date) return { action: 'annuler' };
  return { action: 'terminer', fin: date };
}
