/**
 * Corbeille (US-01-16 ; RG-01-23) : un élément supprimé y reste 30 jours, puis il est effacé
 * définitivement. Sa restauration remet aussi les éléments liés supprimés en même temps.
 */
export const DELAI_CORBEILLE_JOURS = 30;
const JOUR_MS = 86_400_000;

/** Date d'effacement définitif d'un élément supprimé. */
export function effacementLe(supprimeLe: Date): Date {
  return new Date(supprimeLe.getTime() + DELAI_CORBEILLE_JOURS * JOUR_MS);
}

export function restaurable(supprimeLe: Date, maintenant: Date): boolean {
  return maintenant < effacementLe(supprimeLe);
}

export type RefusSuppressionPersonne = 'compte-active';

/**
 * Une fiche dont le compte a été activé porte un historique (connexions, et bientôt notes et
 * présences) : elle se désactive, elle ne se supprime pas (module 01, section 7). La suppression
 * définitive passe par la procédure RGPD d'anonymisation.
 */
export function verifierSuppressionPersonne(
  compteEtat: 'cree' | 'invite' | 'actif' | 'desactive',
): { ok: true } | { ok: false; refus: RefusSuppressionPersonne } {
  return compteEtat === 'cree' || compteEtat === 'invite'
    ? { ok: true }
    : { ok: false, refus: 'compte-active' };
}
