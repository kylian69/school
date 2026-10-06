import type { Palette } from '@scolaly/contracts';

/**
 * Couleur principale de l'école (US-01-14) appliquée à l'interface : elle remplace la couleur
 * d'accent des deux thèmes. Les valeurs sont validées par le contrat (#RRGGBB) avant d'arriver ici.
 */
export function PaletteEcole({ palette }: { palette: Palette | null | undefined }) {
  if (!palette) return null;
  const { clair, sombre } = palette;
  return (
    <style>{`:root,html.light{--accent:${clair.accent};--accent-soft:${clair.accentSoft}}html.dark{--accent:${sombre.accent};--accent-soft:${sombre.accentSoft}}`}</style>
  );
}
