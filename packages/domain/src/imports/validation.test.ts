import { describe, expect, it } from 'vitest';
import { verifierAnnulation, verifierValidation } from './validation.js';

const base = { mode: 'tout' as const, champsManquants: 0, lignesValides: 490, lignesEnErreur: 10 };

describe('RG-01-19 validation d’un import', () => {
  it('est tout ou rien par défaut', () => {
    expect(verifierValidation(base)).toEqual({ ok: false, refus: 'lignes-en-erreur' });
    expect(verifierValidation({ ...base, lignesEnErreur: 0 })).toEqual({ ok: true });
  });

  it('peut n’importer que les lignes valides', () => {
    expect(verifierValidation({ ...base, mode: 'valides' })).toEqual({ ok: true });
    expect(verifierValidation({ ...base, mode: 'valides', lignesValides: 0 })).toEqual({
      ok: false,
      refus: 'rien-a-importer',
    });
  });

  it('exige les colonnes obligatoires', () => {
    expect(verifierValidation({ ...base, champsManquants: 1 })).toEqual({
      ok: false,
      refus: 'colonnes-manquantes',
    });
  });
});

describe('RG-01-20 annulation d’un import', () => {
  const valideLe = new Date('2026-10-06T08:00:00Z');

  it('est possible dans les 24 h, tant qu’aucune fiche n’a servi', () => {
    expect(
      verifierAnnulation({
        valideLe,
        maintenant: new Date('2026-10-07T08:00:00Z'),
        fichesUtilisees: 0,
      }),
    ).toEqual({ ok: true });
    expect(
      verifierAnnulation({
        valideLe,
        maintenant: new Date('2026-10-07T08:00:01Z'),
        fichesUtilisees: 0,
      }),
    ).toEqual({ ok: false, refus: 'delai-depasse' });
    expect(
      verifierAnnulation({
        valideLe,
        maintenant: new Date('2026-10-06T09:00:00Z'),
        fichesUtilisees: 2,
      }),
    ).toEqual({ ok: false, refus: 'deja-utilise' });
  });

  it('ne concerne qu’un import validé', () => {
    expect(
      verifierAnnulation({ valideLe: null, maintenant: valideLe, fichesUtilisees: 0 }),
    ).toEqual({ ok: false, refus: 'non-valide' });
  });
});
