/**
 * Couleur principale d'une école (US-01-14 ; RG-01-24) : refusée si son contraste avec le fond
 * blanc est insuffisant, avec une teinte proche conforme proposée. Le seuil vient de
 * packages/referentials ; les fonds sont les jetons du système de design.
 */
type Rgb = readonly [number, number, number];

export type VerdictCouleur =
  | { ok: true; couleur: string }
  | { ok: false; refus: 'format' }
  | { ok: false; refus: 'contraste'; contraste: number; proposition: string };

export interface Palette {
  /** Thème clair : couleur principale et fond teinté (badges, élément actif). */
  clair: { accent: string; accentSoft: string };
  /** Thème sombre : variante éclaircie pour rester lisible sur les fonds sombres. */
  sombre: { accent: string; accentSoft: string };
}

/** Fonds sur lesquels la couleur principale est lue, repris des jetons du système de design. */
export interface FondsPalette {
  clair: string;
  /** Fond sombre le plus clair où la couleur sert de texte. */
  sombre: string;
  /** Fond sombre des surfaces, base du fond teinté. */
  surfaceSombre: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const BLANC: Rgb = [255, 255, 255];
const NOIR: Rgb = [0, 0, 0];
/** Pas de recherche d'une teinte conforme (2 % de mélange à chaque essai). */
const PAS = 0.02;

const lire = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const ecrire = (rgb: Rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Mélange : `part` de la première couleur, le reste de la seconde. */
const melanger = (a: Rgb, b: Rgb, part: number): Rgb => [
  a[0] * part + b[0] * (1 - part),
  a[1] * part + b[1] * (1 - part),
  a[2] * part + b[2] * (1 - part),
];

/** Luminance relative (WCAG) d'une couleur sRGB. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = Math.round(c) / 255;
    return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const rapport = (a: Rgb, b: Rgb) => {
  const [claire, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (claire + 0.05) / (sombre + 0.05);
};

/** Rapport de contraste entre deux couleurs #RRGGBB, arrondi au centième inférieur. */
export function contraste(a: string, b: string): number {
  return Math.floor(rapport(lire(a), lire(b)) * 100) / 100;
}

/**
 * Teinte la plus proche de `couleur` qui contraste assez avec `fond`, en la mélangeant
 * progressivement avec `vers` (noir pour assombrir, blanc pour éclaircir).
 */
function ajuster(couleur: Rgb, fond: Rgb, vers: Rgb, seuil: number): Rgb {
  for (let part = 1; part > 0; part -= PAS) {
    const essai = melanger(couleur, vers, part);
    if (rapport(essai, fond) >= seuil) return essai;
  }
  return vers;
}

/** Fond teinté le plus marqué (jusqu'à `partMax` de la couleur) sur lequel elle reste lisible. */
function fondTeinte(couleur: Rgb, fond: Rgb, partMax: number, seuil: number): Rgb {
  for (let part = partMax; part > 0; part -= PAS) {
    const essai = melanger(couleur, fond, part);
    if (rapport(couleur, essai) >= seuil) return essai;
  }
  return fond;
}

/** RG-01-24 : couleur au format #RRGGBB, assez contrastée sur le fond clair. */
export function verifierCouleur(hex: string, fondClair: string, seuil: number): VerdictCouleur {
  if (!HEX.test(hex)) return { ok: false, refus: 'format' };
  const couleur = lire(hex);
  const fond = lire(fondClair);
  const valeur = rapport(couleur, fond);
  if (valeur >= seuil) return { ok: true, couleur: hex.toUpperCase() };
  return {
    ok: false,
    refus: 'contraste',
    contraste: Math.floor(valeur * 100) / 100,
    proposition: ecrire(ajuster(couleur, fond, NOIR, seuil)),
  };
}

/** Palette des deux thèmes à partir d'une couleur conforme (vérifiée par verifierCouleur). */
export function paletteDe(hex: string, fonds: FondsPalette, seuil: number): Palette {
  const couleur = lire(hex);
  const clair = lire(fonds.clair);
  const accentSombre = ajuster(couleur, lire(fonds.sombre), BLANC, seuil);
  return {
    clair: { accent: ecrire(couleur), accentSoft: ecrire(fondTeinte(couleur, clair, 0.12, seuil)) },
    sombre: {
      accent: ecrire(accentSombre),
      accentSoft: ecrire(fondTeinte(accentSombre, lire(fonds.surfaceSombre), 0.25, seuil)),
    },
  };
}
