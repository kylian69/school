/**
 * Politique des mots de passe (RG-01-10, recommandations ANSSI et NIST) : longueur d'au moins
 * 12 caractères, comparaison à une liste de mots de passe compromis, sans règle de complexité.
 */
export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12;
export const LONGUEUR_MAXIMALE_MOT_DE_PASSE = 128;

export type RefusMotDePasse = 'trop-court' | 'trop-long' | 'compromis';

export function verifierMotDePasse(
  motDePasse: string,
  compromis: ReadonlySet<string>,
): { ok: true } | { ok: false; refus: RefusMotDePasse } {
  if (motDePasse.length < LONGUEUR_MINIMALE_MOT_DE_PASSE) return { ok: false, refus: 'trop-court' };
  if (motDePasse.length > LONGUEUR_MAXIMALE_MOT_DE_PASSE) return { ok: false, refus: 'trop-long' };
  if (compromis.has(motDePasse.trim().toLowerCase())) return { ok: false, refus: 'compromis' };
  return { ok: true };
}

/**
 * Verrouillage progressif des connexions (module 01, section 9) : au-delà de 5 échecs pour un
 * compte en 15 minutes, chaque nouvel échec bloque le compte 1, 2, 4… minutes, 60 au plus.
 */
export const ECHECS_AVANT_VERROU = 5;
export const FENETRE_ECHECS_MS = 15 * 60_000;
const DELAI_MAXIMUM_MS = 60 * 60_000;

export interface EtatVerrou {
  echecs: number;
  premierEchec: number;
  bloqueJusqua: number;
}

export function apresEchec(etat: EtatVerrou | null, maintenant: number): EtatVerrou {
  const enCours = etat && maintenant - etat.premierEchec < FENETRE_ECHECS_MS ? etat : null;
  const echecs = (enCours?.echecs ?? 0) + 1;
  const premierEchec = enCours?.premierEchec ?? maintenant;
  const depassement = echecs - ECHECS_AVANT_VERROU;
  const bloqueJusqua =
    depassement >= 0 ? maintenant + Math.min(60_000 * 2 ** depassement, DELAI_MAXIMUM_MS) : 0;
  return { echecs, premierEchec, bloqueJusqua };
}

/** Millisecondes restantes avant de pouvoir réessayer, 0 si le compte n'est pas bloqué. */
export function attenteRestante(etat: EtatVerrou | null, maintenant: number): number {
  return etat ? Math.max(0, etat.bloqueJusqua - maintenant) : 0;
}
