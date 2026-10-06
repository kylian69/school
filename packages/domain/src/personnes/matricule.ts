/**
 * Matricule et INE (RG-01-06). Le matricule suit un modèle paramétrable par l'école, par exemple
 * « {ANNEE}-{NUM:5} » ; un numéro séquentiel par défaut. Il est unique dans l'école et jamais
 * réattribué : le compteur ne recule jamais.
 */
export const MODELE_MATRICULE_PAR_DEFAUT = '{NUM:6}';

/** Jetons d'un modèle : année sur 4 ou 2 chiffres, numéro séquentiel sur n chiffres. */
const JETON = /\{(ANNEE|AA|NUM:(\d{1,2}))\}/g;
/** Texte fixe autorisé entre les jetons. */
const TEXTE = /^[A-Z0-9_./-]*$/;

export type RefusModele = 'numero-absent' | 'numero-multiple' | 'jeton-inconnu' | 'trop-long';

export function analyserModeleMatricule(
  modele: string,
): { ok: true } | { ok: false; refus: RefusModele } {
  if (modele.length > 30) return { ok: false, refus: 'trop-long' };
  const numeros = [...modele.matchAll(JETON)].filter((m) => m[1]?.startsWith('NUM'));
  if (numeros.length === 0) return { ok: false, refus: 'numero-absent' };
  if (numeros.length > 1) return { ok: false, refus: 'numero-multiple' };
  const largeur = Number(numeros[0]?.[2]);
  if (largeur < 1 || largeur > 10) return { ok: false, refus: 'jeton-inconnu' };
  return TEXTE.test(modele.replace(JETON, ''))
    ? { ok: true }
    : { ok: false, refus: 'jeton-inconnu' };
}

/** Matricule d'après un modèle valide, l'année de référence et le numéro attribué. */
export function genererMatricule(
  modele: string,
  options: { annee: number; numero: number },
): string {
  return modele.replace(JETON, (_, jeton: string, largeur?: string) => {
    if (jeton === 'ANNEE') return String(options.annee);
    if (jeton === 'AA') return String(options.annee % 100).padStart(2, '0');
    return String(options.numero).padStart(Number(largeur), '0');
  });
}

/**
 * INE (identifiant national élève ou étudiant) : 11 caractères, chiffres et lettres majuscules,
 * le dernier étant une lettre. Saisi avec ou sans espaces, en minuscules ou majuscules.
 */
export function controlerIne(ine: string): 'valide' | 'format' {
  return /^[0-9A-Z]{10}[A-Z]$/.test(ine) ? 'valide' : 'format';
}
