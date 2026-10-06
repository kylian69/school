import { describe, expect, it } from 'vitest';
import {
  codeDeFenetre,
  fenetreDe,
  genererJeton,
  lireJeton,
  verifierCode,
  verifierJeton,
} from './emargement-jeton.js';

const cle = new Uint8Array(32).fill(7);
const autreCle = new Uint8Array(32).fill(8);
const seance = '0192f0a4-1b2c-7d3e-8f40-123456789abc';
const t0 = 1_800_000_000_000;

const verifier = async (jeton: string, maintenant: number, horsLigne = false, avecCle = cle) => {
  const lu = lireJeton(jeton);
  if (!lu) throw new Error('jeton illisible');
  return verifierJeton(avecCle, lu, maintenant, { horsLigne });
};

describe('RG-00-16 jeton signé et rotatif', () => {
  it('change toutes les 15 secondes et donne l’instant du changement', async () => {
    const a = await genererJeton(cle, seance, t0);
    const b = await genererJeton(cle, seance, t0 + 15_000);
    expect(a.jeton).not.toBe(b.jeton);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.changeA).toBe((fenetreDe(t0) + 1) * 15_000);
    expect(lireJeton(a.jeton)).toMatchObject({ seanceId: seance, fenetre: fenetreDe(t0) });
  });

  it('accepte la fenêtre en cours, la précédente et la suivante', async () => {
    const { jeton } = await genererJeton(cle, seance, t0);
    for (const decalage of [0, -15_000, 15_000]) {
      expect(await verifier(jeton, t0 + decalage)).toMatchObject({ ok: true, rejoue: false });
    }
  });

  it('refuse un jeton périmé, falsifié ou d’une autre clé', async () => {
    const { jeton } = await genererJeton(cle, seance, t0);
    expect(await verifier(jeton, t0 + 60_000)).toEqual({ ok: false, refus: 'perime' });
    expect(await verifier(jeton, t0 - 60_000)).toEqual({ ok: false, refus: 'perime' });
    expect(await verifier(jeton, t0, false, autreCle)).toEqual({ ok: false, refus: 'signature' });
    const falsifie = jeton.replace(/\.\d+\./, `.${fenetreDe(t0) + 4}.`);
    expect(await verifier(falsifie, t0 + 60_000)).toEqual({ ok: false, refus: 'signature' });
    const tronque = `${jeton.slice(0, -1)}${jeton.endsWith('A') ? 'B' : 'A'}`;
    expect(await verifier(tronque, t0)).toEqual({ ok: false, refus: 'signature' });
  });

  it('RG-00-19 accepte un scan hors ligne dans la fenêtre de grâce, marqué rejoué', async () => {
    const { jeton } = await genererJeton(cle, seance, t0);
    expect(await verifier(jeton, t0 + 4 * 60_000, true)).toMatchObject({ ok: true, rejoue: true });
    expect(await verifier(jeton, t0 + 6 * 60_000, true)).toEqual({ ok: false, refus: 'perime' });
    expect(await verifier(jeton, t0 - 60_000, true)).toEqual({ ok: false, refus: 'perime' });
  });

  it('écarte un texte qui n’a pas la forme d’un jeton', () => {
    for (const texte of ['', 'bonjour', `${seance}.12`, `${seance}.x.${'a'.repeat(22)}`]) {
      expect(lireJeton(texte)).toBeNull();
    }
  });
});

describe('RG-06-05 code à 6 chiffres', () => {
  it('accepte le code de la fenêtre en cours ou voisine, pas un autre', async () => {
    const fenetre = fenetreDe(t0);
    const code = await codeDeFenetre(cle, seance, fenetre);
    expect(await verifierCode(cle, seance, code, t0)).toBe(true);
    expect(await verifierCode(cle, seance, code, t0 + 15_000)).toBe(true);
    expect(await verifierCode(cle, seance, code, t0 + 120_000)).toBe(false);
    expect(await verifierCode(cle, seance, '12345', t0)).toBe(false);
    expect(await verifierCode(autreCle, seance, code, t0)).toBe(false);
  });
});
