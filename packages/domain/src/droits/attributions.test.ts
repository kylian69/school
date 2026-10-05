import { describe, expect, it } from 'vitest';
import { retraitAttribution, verifierNouvelleAttribution } from './attributions.js';

const base = {
  perimetreType: 'organisation' as const,
  perimetreId: null,
  debut: '2026-10-05',
  fin: null,
  perimetresDisponibles: ['organisation', 'etablissement', 'soi'] as const,
  dejaAttribue: false,
};

describe('US-01-09 attribution d’un rôle avec un périmètre', () => {
  it('accepte l’organisation, ou un établissement désigné', () => {
    expect(verifierNouvelleAttribution(base)).toEqual({ ok: true });
    expect(
      verifierNouvelleAttribution({ ...base, perimetreType: 'etablissement', perimetreId: 'e1' }),
    ).toEqual({ ok: true });
  });

  it('refuse un périmètre sans cible, ou une cible inattendue', () => {
    expect(verifierNouvelleAttribution({ ...base, perimetreType: 'etablissement' })).toEqual({
      ok: false,
      refus: 'perimetre-sans-cible',
    });
    expect(verifierNouvelleAttribution({ ...base, perimetreId: 'e1' })).toEqual({
      ok: false,
      refus: 'perimetre-cible-inattendue',
    });
  });

  it('refuse un périmètre dont les objets n’existent pas encore', () => {
    expect(
      verifierNouvelleAttribution({ ...base, perimetreType: 'formation', perimetreId: 'f1' }),
    ).toEqual({ ok: false, refus: 'perimetre-indisponible' });
  });

  it('refuse une fin avant le début, et un rôle déjà attribué sur ce périmètre', () => {
    expect(verifierNouvelleAttribution({ ...base, fin: '2026-10-05' })).toEqual({
      ok: false,
      refus: 'dates',
    });
    expect(verifierNouvelleAttribution({ ...base, fin: '2027-08-31' })).toEqual({ ok: true });
    expect(verifierNouvelleAttribution({ ...base, dejaAttribue: true })).toEqual({
      ok: false,
      refus: 'deja-attribue',
    });
  });

  it('termine un rôle en cours le jour du retrait, annule un rôle à venir', () => {
    expect(retraitAttribution({ debut: '2026-01-01', fin: null }, '2026-10-05')).toEqual({
      action: 'terminer',
      fin: '2026-10-05',
    });
    expect(retraitAttribution({ debut: '2026-10-05', fin: null }, '2026-10-05')).toEqual({
      action: 'annuler',
    });
    expect(retraitAttribution({ debut: '2027-01-01', fin: '2027-06-30' }, '2026-10-05')).toEqual({
      action: 'annuler',
    });
    expect(retraitAttribution({ debut: '2026-01-01', fin: '2026-06-30' }, '2026-10-05')).toEqual({
      action: 'deja-terminee',
    });
  });
});
