/**
 * Validation et annulation d'un import (RG-01-19, RG-01-20). Un import est tout ou rien par
 * défaut ; l'utilisateur peut choisir de n'importer que les lignes valides. Il s'annule dans les
 * 24 h s'il n'a pas encore été utilisé.
 */
export type ModeValidation = 'tout' | 'valides';

/** Délai d'annulation d'un import validé (RG-01-20). */
export const DELAI_ANNULATION_MS = 24 * 3_600_000;

export type RefusValidation = 'colonnes-manquantes' | 'lignes-en-erreur' | 'rien-a-importer';

export function verifierValidation(options: {
  mode: ModeValidation;
  champsManquants: number;
  lignesValides: number;
  lignesEnErreur: number;
}): { ok: true } | { ok: false; refus: RefusValidation } {
  if (options.champsManquants > 0) return { ok: false, refus: 'colonnes-manquantes' };
  if (options.mode === 'tout' && options.lignesEnErreur > 0) {
    return { ok: false, refus: 'lignes-en-erreur' };
  }
  if (options.lignesValides === 0) return { ok: false, refus: 'rien-a-importer' };
  return { ok: true };
}

export type RefusAnnulation = 'non-valide' | 'delai-depasse' | 'deja-utilise';

/**
 * RG-01-20 : annulable dans les 24 h qui suivent la validation, si aucune fiche créée n'a servi
 * (invitation envoyée, compte activé, rôle ajouté depuis…).
 */
export function verifierAnnulation(options: {
  valideLe: Date | null;
  maintenant: Date;
  fichesUtilisees: number;
}): { ok: true } | { ok: false; refus: RefusAnnulation } {
  if (!options.valideLe) return { ok: false, refus: 'non-valide' };
  if (options.maintenant.getTime() - options.valideLe.getTime() > DELAI_ANNULATION_MS) {
    return { ok: false, refus: 'delai-depasse' };
  }
  if (options.fichesUtilisees > 0) return { ok: false, refus: 'deja-utilise' };
  return { ok: true };
}
