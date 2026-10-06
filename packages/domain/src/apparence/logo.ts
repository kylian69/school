/**
 * Logo d'une école (US-01-14 ; RG-01-24) : PNG ou SVG. Un SVG est un document qui peut porter du
 * script ou charger des ressources externes : seul un dessin autonome est accepté.
 */
export type VerdictSvg = { ok: true } | { ok: false; refus: 'svg-invalide' | 'svg-dangereux' };

/** Prologue facultatif (déclaration XML, commentaires, DOCTYPE), puis la racine <svg>. */
const RACINE_SVG =
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>[]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

/**
 * Contenus refusés : scripts, gestionnaires d'événements, documents ou objets embarqués,
 * entités XML, et toute référence qui ne soit ni interne (#…) ni une image embarquée.
 */
const DANGERS = [
  /<script/i,
  /<foreignObject/i,
  /<(?:iframe|embed|object)/i,
  /\son[a-z]+\s*=/i,
  /<!ENTITY/i,
  /javascript:/i,
  // Le guillemet est dans l'assertion : sinon, le moteur l'ignorerait pour contourner la négation.
  /(?:^|[\s:])href\s*=\s*(?!["']?(?:#|data:image\/(?:png|jpeg|gif|webp);))/i,
  /url\(\s*(?!["']?(?:#|data:image\/(?:png|jpeg|gif|webp);))/i,
  /@import/i,
];

export function analyserSvg(texte: string): VerdictSvg {
  if (!RACINE_SVG.test(texte) || !/<\/svg>\s*$/i.test(texte)) {
    return { ok: false, refus: 'svg-invalide' };
  }
  return DANGERS.some((danger) => danger.test(texte))
    ? { ok: false, refus: 'svg-dangereux' }
    : { ok: true };
}
