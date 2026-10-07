import { describe, expect, it } from 'vitest';
import {
  compterJours,
  finPeriodeEssai,
  genererCalendrier,
  joursEntre,
  MODELES_FOURNIS,
  typeDuJour,
  verifierMotif,
} from './rythmes.js';

const motif = (code: string) => MODELES_FOURNIS.find((m) => m.code === code)?.motif ?? [];

describe('RG-03-10 modèles de rythme', () => {
  it('fournit 5 modèles valides', () => {
    expect(MODELES_FOURNIS).toHaveLength(5);
    expect(MODELES_FOURNIS.every((m) => verifierMotif(m.motif))).toBe(true);
  });
  it('refuse un motif vide, trop long, incomplet ou sans jour d’école', () => {
    const entreprise = Array<'entreprise'>(7).fill('entreprise');
    expect(verifierMotif([])).toBe(false);
    expect(verifierMotif(Array(5).fill(motif('deux-jours-ecole')[0]))).toBe(false);
    expect(verifierMotif([['ecole']])).toBe(false);
    expect(verifierMotif([entreprise])).toBe(false);
    expect(verifierMotif([[...entreprise.slice(1), 'vacances' as 'ecole']])).toBe(false);
  });
});

describe('RG-03-11 calendrier d’une promotion', () => {
  it('génère « 2 jours / 3 jours » sur une année, fériés exclus', () => {
    const calendrier = genererCalendrier({
      debut: '2026-09-01',
      fin: '2027-08-31',
      motif: motif('deux-jours-ecole'),
      feries: ['2026-11-11', '2027-05-25'],
      fermetures: [],
    });
    expect(Object.keys(calendrier)).toHaveLength(365);
    // Mardi 1er septembre 2026 : école ; mercredi : entreprise ; samedi : fermé.
    expect(calendrier['2026-09-01']).toBe('ecole');
    expect(calendrier['2026-09-02']).toBe('entreprise');
    expect(calendrier['2026-09-05']).toBe('ferme');
    expect(calendrier['2026-11-11']).toBe('ferme');
    // Mercredi 11 novembre (entreprise) et mardi 25 mai 2027 (école) : fermés.
    expect(calendrier['2027-05-25']).toBe('ferme');
    expect(compterJours(calendrier)).toEqual({
      ecole: 104,
      entreprise: 155,
      ferme: 106,
      examen: 0,
    });
  });

  it('alterne les semaines depuis celle du début ; une fermeture de l’école envoie en entreprise', () => {
    const calendrier = genererCalendrier({
      debut: '2026-09-03',
      fin: '2026-09-30',
      motif: motif('une-semaine-sur-deux'),
      feries: [],
      fermetures: [
        { dateDebut: '2026-09-14', dateFin: '2026-09-15', type: 'vacances' },
        { dateDebut: '2026-09-16', dateFin: '2026-09-16', type: 'ferie' },
      ],
    });
    // Jeudi 3 : première semaine (école) ; lundi 7 : deuxième semaine (entreprise).
    expect(calendrier['2026-09-03']).toBe('ecole');
    expect(calendrier['2026-09-07']).toBe('entreprise');
    expect(calendrier['2026-09-14']).toBe('entreprise');
    expect(calendrier['2026-09-16']).toBe('ferme');
    expect(calendrier['2026-09-17']).toBe('ecole');
    expect(calendrier['2026-09-21']).toBe('entreprise');
  });

  it('laisse fermés les jours qu’un motif incomplet ne décrit pas', () => {
    expect(
      genererCalendrier({
        debut: '2026-09-07',
        fin: '2026-09-08',
        motif: [['ecole']],
        feries: [],
        fermetures: [],
      }),
    ).toEqual({ '2026-09-07': 'ecole', '2026-09-08': 'ferme' });
  });
});

describe('RG-03-12 exceptions individuelles', () => {
  it('l’exception l’emporte sur sa période, puis le calendrier de la promotion', () => {
    const calendrier = { '2026-09-07': 'ecole', '2026-09-08': 'ecole' } as const;
    const exceptions = [
      { debut: '2026-09-08', fin: '2026-09-30', jours: { '2026-09-08': 'entreprise' } as const },
      { debut: '2026-09-01', fin: '2026-09-30', jours: {} },
    ];
    expect(typeDuJour(calendrier, exceptions, '2026-09-07')).toBe('ecole');
    expect(typeDuJour(calendrier, exceptions, '2026-09-08')).toBe('entreprise');
    expect(typeDuJour(calendrier, exceptions, '2026-09-09')).toBeNull();
    expect(typeDuJour(null, [], '2026-09-07')).toBeNull();
  });
});

describe('RG-03-08 fin de la période d’essai', () => {
  it('tombe au 45e jour de présence en entreprise', () => {
    const calendrier = genererCalendrier({
      debut: '2026-09-01',
      fin: '2027-08-31',
      motif: motif('deux-jours-ecole'),
      feries: [],
      fermetures: [],
    });
    const fin = finPeriodeEssai({
      debut: '2026-09-01',
      fin: '2028-08-31',
      joursEntreprise: 45,
      typeDuJour: (jour) => typeDuJour(calendrier, [], jour),
    });
    // 3 jours en entreprise par semaine : 15 semaines, le vendredi de la 15e.
    expect(fin).toBe('2026-12-11');
    expect(
      finPeriodeEssai({
        debut: '2026-09-01',
        fin: '2026-09-30',
        joursEntreprise: 45,
        typeDuJour: () => 'entreprise',
      }),
    ).toBeNull();
  });

  it('énumère les jours d’un intervalle', () => {
    expect(joursEntre('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});
