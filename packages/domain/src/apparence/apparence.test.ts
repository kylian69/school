import { describe, expect, it } from 'vitest';
import { contraste, paletteDe, verifierCouleur } from './couleurs.js';
import { analyserSvg } from './logo.js';

const BLANC = '#FFFFFF';
const FONDS = { clair: BLANC, sombre: '#1B1E28', surfaceSombre: '#13151C' };
const SEUIL = 4.5;

describe('RG-01-24 couleur principale', () => {
  it('mesure le contraste entre deux couleurs', () => {
    expect(contraste('#000000', BLANC)).toBe(21);
    expect(contraste(BLANC, '#000000')).toBe(21);
    expect(contraste('#4F46E5', BLANC)).toBeGreaterThan(SEUIL);
  });

  it('accepte une couleur assez contrastée, en majuscules', () => {
    expect(verifierCouleur('#4f46e5', BLANC, SEUIL)).toEqual({ ok: true, couleur: '#4F46E5' });
  });

  it('refuse un format autre que #RRGGBB', () => {
    expect(verifierCouleur('rouge', BLANC, SEUIL)).toEqual({ ok: false, refus: 'format' });
    expect(verifierCouleur('#FFF', BLANC, SEUIL)).toEqual({ ok: false, refus: 'format' });
  });

  it('refuse une couleur peu contrastée et propose une teinte proche conforme', () => {
    const verdict = verifierCouleur('#FFD700', BLANC, SEUIL);
    if (verdict.ok || verdict.refus !== 'contraste') throw new Error('refus attendu');
    expect(verdict.contraste).toBeLessThan(SEUIL);
    expect(contraste(verdict.proposition, BLANC)).toBeGreaterThanOrEqual(SEUIL);
    // Une teinte proche : assombrie, sans virer au noir.
    expect(verdict.proposition).not.toBe('#000000');
    expect(verifierCouleur(verdict.proposition, BLANC, SEUIL)).toMatchObject({ ok: true });
  });

  it('construit une palette lisible dans les deux thèmes', () => {
    const palette = paletteDe('#4F46E5', FONDS, SEUIL);
    expect(palette.clair.accent).toBe('#4F46E5');
    expect(contraste(palette.clair.accent, palette.clair.accentSoft)).toBeGreaterThanOrEqual(SEUIL);
    expect(contraste(palette.sombre.accent, FONDS.sombre)).toBeGreaterThanOrEqual(SEUIL);
    expect(contraste(palette.sombre.accent, palette.sombre.accentSoft)).toBeGreaterThanOrEqual(
      SEUIL,
    );
  });

  it('se rabat sur le noir, le blanc ou le fond quand aucune teinte ne suffit', () => {
    expect(verifierCouleur('#FFD700', BLANC, 22)).toMatchObject({ proposition: '#000000' });
    expect(paletteDe('#4F46E5', FONDS, 22)).toEqual({
      clair: { accent: '#4F46E5', accentSoft: BLANC },
      sombre: { accent: BLANC, accentSoft: FONDS.surfaceSombre },
    });
  });
});

describe('RG-01-24 logo SVG', () => {
  const svg = (contenu: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${contenu}</svg>`;

  it('accepte un dessin autonome, prologue et images embarquées compris', () => {
    expect(analyserSvg(svg('<rect width="10" height="10" fill="#4F46E5"/>'))).toEqual({
      ok: true,
    });
    expect(
      analyserSvg(
        `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Logo -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${svg('<defs><path id="a" d="M0 0h1"/></defs><use href="#a"/><image href="data:image/png;base64,AAAA"/>')}\n`,
      ),
    ).toEqual({ ok: true });
  });

  it('refuse ce qui n’est pas un SVG', () => {
    expect(analyserSvg('<html><body/></html>')).toEqual({ ok: false, refus: 'svg-invalide' });
    expect(analyserSvg('<svg>')).toEqual({ ok: false, refus: 'svg-invalide' });
  });

  it.each([
    ['un script', '<script>alert(1)</script>'],
    ['un gestionnaire d’événement', '<rect onload="alert(1)"/>'],
    ['un objet étranger', '<foreignObject><div/></foreignObject>'],
    ['un lien externe', '<a href="https://exemple.test"><rect/></a>'],
    ['une référence externe', '<use href="https://exemple.test/s.svg#a"/>'],
    ['une URL javascript', '<a xlink:href="javascript:alert(1)"/>'],
    ['une ressource de style externe', '<rect style="fill:url(https://exemple.test/a)"/>'],
    ['un import de style', '<style>@import "https://exemple.test/a.css";</style>'],
    ['une entité XML', '<!ENTITY x "y">'],
    ['un document embarqué', '<iframe/>'],
    ['une image externe', "<image href='https://exemple.test/a.png'/>"],
  ])('refuse %s', (_, contenu) => {
    expect(analyserSvg(svg(contenu))).toEqual({ ok: false, refus: 'svg-dangereux' });
  });
});
