import { describe, expect, it } from 'vitest';
import { apresEchec, attenteRestante, verifierMotDePasse } from './mots-de-passe.js';

const compromis = new Set(['motdepasse123']);

describe('RG-01-10 mots de passe', () => {
  it('exige 12 caractères, en accepte 128 au plus, sans règle de complexité', () => {
    expect(verifierMotDePasse('court', compromis)).toEqual({ ok: false, refus: 'trop-court' });
    expect(verifierMotDePasse('a'.repeat(129), compromis)).toEqual({
      ok: false,
      refus: 'trop-long',
    });
    expect(verifierMotDePasse('une phrase toute simple', compromis)).toEqual({ ok: true });
  });

  it('refuse un mot de passe compromis, quelle que soit la casse', () => {
    expect(verifierMotDePasse('MotDePasse123', compromis)).toEqual({
      ok: false,
      refus: 'compromis',
    });
  });
});

describe('Verrouillage progressif (module 01, section 9)', () => {
  const t0 = 1_000_000_000;
  const echouer = (n: number, depart = t0) => {
    let etat = null;
    for (let i = 0; i < n; i++) etat = apresEchec(etat, depart + i * 1000);
    return etat;
  };

  it('ne bloque pas avant 5 échecs, puis bloque 1, 2, 4 minutes', () => {
    expect(attenteRestante(echouer(4), t0 + 4000)).toBe(0);
    expect(attenteRestante(echouer(5), t0 + 4000)).toBe(60_000);
    expect(attenteRestante(echouer(6), t0 + 5000)).toBe(120_000);
    expect(attenteRestante(echouer(7), t0 + 6000)).toBe(240_000);
  });

  it('plafonne le délai à une heure', () => {
    expect(attenteRestante(echouer(20), t0 + 19_000)).toBe(3_600_000);
  });

  it('repart de zéro après 15 minutes sans échec', () => {
    const ancien = echouer(4);
    expect(apresEchec(ancien, t0 + 16 * 60_000)).toMatchObject({ echecs: 1, bloqueJusqua: 0 });
    expect(attenteRestante(null, t0)).toBe(0);
  });
});
