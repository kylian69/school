import { describe, expect, it } from 'vitest';
import {
  changerPeriode,
  inscriptionActive,
  valeurA,
  verifierInscription,
  verifierPromotion,
  verifierSortie,
} from './inscriptions.js';

describe('RG-02-12 promotion', () => {
  const p = {
    dateDebut: '2026-09-01',
    dateFin: '2027-08-31',
    anneeFormation: 1,
    dureeFormation: 2,
  };
  it('accepte une promotion qui peut déborder l’année scolaire', () => {
    expect(verifierPromotion(p)).toEqual({ ok: true });
    expect(verifierPromotion({ ...p, dateFin: '2027-10-15' })).toEqual({ ok: true });
  });
  it('refuse des dates inversées ou une année que la formation ne comporte pas', () => {
    expect(verifierPromotion({ ...p, dateFin: '2026-09-01' })).toEqual({
      ok: false,
      refus: 'dates-promotion',
    });
    expect(verifierPromotion({ ...p, anneeFormation: 3 })).toEqual({
      ok: false,
      refus: 'annee-hors-duree',
    });
    expect(verifierPromotion({ ...p, anneeFormation: 0 })).toEqual({
      ok: false,
      refus: 'annee-hors-duree',
    });
  });
});

describe('RG-02-13 inscription', () => {
  const base = {
    dateEntree: '2026-09-01',
    dateSortie: null,
    promotion: { dateDebut: '2026-09-01', dateFin: '2027-06-30' },
    statut: 'apprenti',
    modesFormation: ['initial', 'apprentissage'],
    dejaInscrit: false,
  } as const;
  it('accepte une inscription dans la promotion, avec un statut autorisé', () => {
    expect(verifierInscription(base)).toEqual({ ok: true });
    expect(verifierInscription({ ...base, dateSortie: '2027-01-01' })).toEqual({ ok: true });
  });
  it('refuse un doublon, une entrée hors promotion, une sortie avant l’entrée, un statut non autorisé', () => {
    expect(verifierInscription({ ...base, dejaInscrit: true })).toEqual({
      ok: false,
      refus: 'deja-inscrit',
    });
    expect(verifierInscription({ ...base, dateEntree: '2026-08-31' })).toEqual({
      ok: false,
      refus: 'entree-hors-promotion',
    });
    expect(verifierInscription({ ...base, dateEntree: '2027-07-01' })).toEqual({
      ok: false,
      refus: 'entree-hors-promotion',
    });
    expect(verifierInscription({ ...base, dateSortie: '2026-09-01' })).toEqual({
      ok: false,
      refus: 'sortie-avant-entree',
    });
    expect(verifierInscription({ ...base, statut: 'professionnalisation' })).toEqual({
      ok: false,
      refus: 'statut-non-autorise',
    });
  });
});

describe('RG-02-17 sortie en cours d’année', () => {
  const base = {
    etat: 'inscrit',
    nouvelEtat: 'demissionnaire',
    dateEntree: '2026-09-01',
    dateSortie: '2027-01-15',
    motif: 'Réorientation',
  } as const;
  it('ferme l’inscription à la date de sortie, avec un motif', () => {
    expect(verifierSortie(base)).toEqual({ ok: true });
    expect(verifierSortie({ ...base, nouvelEtat: 'diplome', motif: null })).toEqual({ ok: true });
    expect(
      verifierSortie({ ...base, nouvelEtat: 'inscrit', dateSortie: null, motif: null }),
    ).toEqual({ ok: true });
  });
  it('exige date et motif, une sortie après l’entrée, et ne rouvre pas une inscription close', () => {
    expect(verifierSortie({ ...base, dateSortie: null })).toEqual({
      ok: false,
      refus: 'sortie-sans-date',
    });
    expect(verifierSortie({ ...base, nouvelEtat: 'exclu', motif: ' ' })).toEqual({
      ok: false,
      refus: 'sortie-sans-motif',
    });
    expect(verifierSortie({ ...base, motif: null })).toEqual({
      ok: false,
      refus: 'sortie-sans-motif',
    });
    expect(verifierSortie({ ...base, dateSortie: '2026-08-01' })).toEqual({
      ok: false,
      refus: 'sortie-avant-entree',
    });
    expect(verifierSortie({ ...base, etat: 'exclu', nouvelEtat: 'inscrit' })).toEqual({
      ok: false,
      refus: 'etat-final',
    });
    expect(
      verifierSortie({ ...base, etat: 'diplome', nouvelEtat: 'diplome', motif: null }),
    ).toEqual({ ok: true });
  });
  it('une inscription sortie disparaît des listes à la date de sortie, pas avant', () => {
    const i = { etat: 'inscrit', dateEntree: '2026-09-01', dateSortie: '2027-01-15' } as const;
    expect(inscriptionActive(i, '2027-01-14')).toBe(true);
    expect(inscriptionActive(i, '2027-01-15')).toBe(false);
    expect(inscriptionActive(i, '2026-08-31')).toBe(false);
    expect(inscriptionActive({ ...i, dateSortie: null }, '2030-01-01')).toBe(true);
    expect(inscriptionActive({ ...i, etat: 'preinscrit' }, '2026-10-01')).toBe(false);
  });
});

describe('section 7 : changement de statut ou de groupe en cours d’année', () => {
  const initial = [{ debut: '2026-09-01', fin: null, valeur: 'initial' }] as const;
  it('ouvre une nouvelle période à la date d’effet et ferme la précédente', () => {
    const r = changerPeriode(initial, 'apprenti', '2027-01-05');
    expect(r).toEqual({
      ok: true,
      periodes: [
        { debut: '2026-09-01', fin: '2027-01-05', valeur: 'initial' },
        { debut: '2027-01-05', fin: null, valeur: 'apprenti' },
      ],
    });
    if (!r.ok) throw new Error();
    expect(valeurA(r.periodes, '2027-01-04')).toBe('initial');
    expect(valeurA(r.periodes, '2027-01-05')).toBe('apprenti');
    expect(valeurA(r.periodes, '2026-01-01')).toBeNull();
  });
  it('remplace une période qui commence le même jour, ignore un changement sans effet', () => {
    expect(changerPeriode(initial, 'apprenti', '2026-09-01')).toEqual({
      ok: true,
      periodes: [{ debut: '2026-09-01', fin: null, valeur: 'apprenti' }],
    });
    expect(changerPeriode(initial, 'initial', '2027-01-05')).toEqual({
      ok: true,
      periodes: [...initial],
    });
    expect(changerPeriode([], 'initial', '2026-09-01')).toEqual({
      ok: true,
      periodes: [{ debut: '2026-09-01', fin: null, valeur: 'initial' }],
    });
  });
  it('garde les périodes closes et refuse un effet antérieur à la période en cours', () => {
    const histoire = [
      { debut: '2026-09-01', fin: '2026-10-01', valeur: 'a' },
      { debut: '2026-10-01', fin: null, valeur: 'b' },
    ];
    expect(changerPeriode(histoire, 'c', '2026-09-15')).toEqual({ ok: false });
    const r = changerPeriode(histoire, 'c', '2027-01-01');
    expect(r.ok && r.periodes.map((p) => [p.valeur, p.fin])).toEqual([
      ['a', '2026-10-01'],
      ['b', '2027-01-01'],
      ['c', null],
    ]);
  });
});
