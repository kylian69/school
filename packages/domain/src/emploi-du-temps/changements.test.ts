import { describe, expect, it } from 'vitest';
import { changementSignificatif, remplacerIntervenant, verifierReport } from './changements.js';

const ancien = {
  debut: new Date('2026-11-03T08:00:00Z'),
  fin: new Date('2026-11-03T10:00:00Z'),
};
const nouveau = {
  debut: new Date('2026-11-10T08:00:00Z'),
  fin: new Date('2026-11-10T10:00:00Z'),
};
const report = {
  motif: 'Intervenant malade',
  statut: 'publiee' as const,
  presences: 0,
  ancien,
  nouveau,
  maintenant: new Date('2026-11-02T12:00:00Z'),
};

describe('US-04-11 report d’une séance', () => {
  it('US-04-11 accepte le report motivé d’une séance publiée vers un créneau futur', () => {
    expect(verifierReport(report)).toEqual({ ok: true });
  });

  it.each(['', '   ', null, undefined])('US-04-11 exige un motif (%j)', (motif) => {
    expect(verifierReport({ ...report, motif })).toEqual({ ok: false, refus: 'motif-requis' });
  });

  it.each(['brouillon', 'annulee', 'reportee'] as const)(
    'US-04-11 refuse le report d’une séance %s',
    (statut) => {
      expect(verifierReport({ ...report, statut })).toEqual({ ok: false, refus: 'non-publiee' });
    },
  );

  it('refuse le report d’une séance dont l’appel est fait (cas limite du module 04)', () => {
    expect(verifierReport({ ...report, presences: 3 })).toEqual({
      ok: false,
      refus: 'appel-fait',
    });
  });

  it('refuse un nouveau créneau dont la fin ne suit pas le début', () => {
    expect(
      verifierReport({ ...report, nouveau: { debut: nouveau.fin, fin: nouveau.debut } }),
    ).toEqual({ ok: false, refus: 'horaire' });
  });

  it('refuse un report vers le même créneau', () => {
    expect(verifierReport({ ...report, nouveau: { ...ancien } })).toEqual({
      ok: false,
      refus: 'meme-creneau',
    });
  });

  it('accepte un créneau qui ne change que par sa fin', () => {
    expect(
      verifierReport({
        ...report,
        nouveau: { debut: ancien.debut, fin: new Date('2026-11-03T11:00:00Z') },
      }),
    ).toEqual({ ok: true });
  });

  it('refuse un report vers un créneau passé', () => {
    expect(verifierReport({ ...report, maintenant: nouveau.debut })).toEqual({
      ok: false,
      refus: 'passe',
    });
  });
});

describe('US-04-11 remplacement d’intervenant', () => {
  it('RG-04-01 remplace l’intervenant et garde les co-intervenants', () => {
    expect(remplacerIntervenant(['b', 'a'], 'a', 'c')).toEqual({
      ok: true,
      intervenantIds: ['b', 'c'],
    });
  });

  it('refuse un remplaçant identique', () => {
    expect(remplacerIntervenant(['a'], 'a', 'a')).toEqual({ ok: false, refus: 'identique' });
  });

  it('refuse un intervenant absent de la séance', () => {
    expect(remplacerIntervenant(['a'], 'b', 'c')).toEqual({ ok: false, refus: 'absent' });
  });

  it('refuse un remplaçant déjà présent', () => {
    expect(remplacerIntervenant(['a', 'b'], 'a', 'b')).toEqual({
      ok: false,
      refus: 'deja-present',
    });
  });
});

describe('RG-04-14 modification significative', () => {
  const etat = {
    statut: 'publiee' as const,
    ...ancien,
    salleId: 's1',
    intervenantIds: ['a', 'b'],
  };

  it('RG-04-14 ignore une séance encore en brouillon', () => {
    expect(
      changementSignificatif(
        { ...etat, statut: 'brouillon' },
        { ...etat, statut: 'brouillon', salleId: 's2' },
      ),
    ).toBe(false);
  });

  it('RG-04-14 ne signale rien si rien de significatif ne change', () => {
    expect(changementSignificatif(etat, { ...etat, intervenantIds: ['b', 'a'] })).toBe(false);
  });

  it.each([
    ['l’horaire', { debut: nouveau.debut }],
    ['la fin', { fin: new Date('2026-11-03T11:00:00Z') }],
    ['la salle', { salleId: null }],
    ['les intervenants', { intervenantIds: ['a'] }],
    ['un intervenant', { intervenantIds: ['a', 'c'] }],
    ['le statut (annulation)', { statut: 'annulee' as const }],
  ])('RG-04-14 signale un changement de %s', (_, change) => {
    expect(changementSignificatif(etat, { ...etat, ...change })).toBe(true);
  });
});
