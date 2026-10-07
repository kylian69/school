import { describe, expect, it } from 'vitest';
import { niveauRetenu, validerBlocParCompetences, type NiveauMaitrise } from './competences.js';
import {
  arrondir,
  mentionPour,
  REGLES_VALIDATION_PAR_DEFAUT,
  trierRegles,
  verifierReglesValidation,
  type RegleParticuliere,
} from './regles.js';

const echelle: NiveauMaitrise[] = [
  { id: 'na', libelle: 'Non acquis', ordre: 1, valide: false },
  { id: 'ec', libelle: 'En cours', ordre: 2, valide: false },
  { id: 'ac', libelle: 'Acquis', ordre: 3, valide: true },
  { id: 'ex', libelle: 'Expert', ordre: 4, valide: true },
];

const evaluations = [
  { niveauId: 'ac', date: '2026-11-02' },
  { niveauId: 'na', date: '2026-10-01' },
  { niveauId: 'ex', date: '2026-10-15' },
  { niveauId: 'na', date: '2026-12-01' },
  { niveauId: 'ac', date: '2026-09-20' },
];

describe('RG-02-25 niveau retenu d’une compétence', () => {
  it('retient la dernière évaluation par défaut', () => {
    expect(niveauRetenu(evaluations, 'derniere', echelle)).toEqual({
      niveauId: 'na',
      force: false,
    });
  });

  it('retient le meilleur niveau', () => {
    expect(niveauRetenu(evaluations, 'meilleur', echelle).niveauId).toBe('ex');
  });

  it('retient le niveau le plus fréquent, l’égalité tranchée par le plus récent', () => {
    expect(niveauRetenu(evaluations, 'frequent', echelle).niveauId).toBe('na');
    expect(niveauRetenu(evaluations.slice(0, 3), 'frequent', echelle).niveauId).toBe('ac');
    expect(
      niveauRetenu(
        [
          { niveauId: 'na', date: '2026-10-01' },
          { niveauId: 'na', date: '2026-10-02' },
          { niveauId: 'ac', date: '2026-10-03' },
        ],
        'frequent',
        echelle,
      ).niveauId,
    ).toBe('na');
  });

  it('un forçage l’emporte et se signale', () => {
    expect(niveauRetenu(evaluations, 'derniere', echelle, 'ac')).toEqual({
      niveauId: 'ac',
      force: true,
    });
  });

  it('sans évaluation sur un niveau connu, aucun niveau', () => {
    expect(
      niveauRetenu([{ niveauId: 'supprime', date: '2026-10-01' }], 'meilleur', echelle),
    ).toEqual({
      niveauId: null,
      force: false,
    });
  });
});

describe('RG-02-24 validation d’un bloc par les compétences', () => {
  const competences = [
    { id: 'c1', code: 'C1.1' },
    { id: 'c2', code: 'C1.2' },
    { id: 'c3', code: 'C1.3' },
  ];

  it('valide quand toutes les compétences sont au niveau « acquis » ou plus, et pas avant', () => {
    expect(
      validerBlocParCompetences(competences, { c1: 'ac', c2: 'ex', c3: 'ac' }, echelle),
    ).toEqual({
      valide: true,
      manquantes: [],
    });
    expect(
      validerBlocParCompetences(competences, { c1: 'ac', c2: 'ec', c3: null }, echelle),
    ).toEqual({
      valide: false,
      manquantes: ['C1.2', 'C1.3'],
    });
  });

  it('un bloc sans compétence ne se valide pas par les compétences', () => {
    expect(validerBlocParCompetences([], {}, echelle).valide).toBe(false);
  });
});

describe('RG-02-08 arrondi et mentions', () => {
  it('arrondit au centième selon la méthode choisie', () => {
    expect(arrondir(12.345, { decimales: 2, methode: 'plus_proche' })).toBe(12.35);
    expect(arrondir(9.996, { decimales: 2, methode: 'inferieur' })).toBe(9.99);
    expect(arrondir(9.991, { decimales: 2, methode: 'superieur' })).toBe(10);
    expect(arrondir(10, { decimales: 1, methode: 'superieur' })).toBe(10);
  });

  it('donne la plus haute mention atteinte', () => {
    const { mentions } = REGLES_VALIDATION_PAR_DEFAUT;
    expect(mentionPour(11.99, mentions)).toBeNull();
    expect(mentionPour(12, mentions)).toBe('Assez bien');
    expect(mentionPour(15.5, mentions)).toBe('Bien');
    expect(mentionPour(16, mentions)).toBe('Très bien');
  });
});

describe('RG-02-24 cohérence des règles', () => {
  const regles = REGLES_VALIDATION_PAR_DEFAUT;

  it('accepte les valeurs par défaut et la combinaison blocs + les deux', () => {
    expect(verifierReglesValidation(regles)).toEqual({ ok: true });
    expect(
      verifierReglesValidation({
        ...regles,
        mode: 'blocs',
        modeEvaluation: 'les_deux',
        validationBlocs: 'les_deux',
      }),
    ).toEqual({ ok: true });
  });

  it('refuse les combinaisons incohérentes', () => {
    expect(verifierReglesValidation({ ...regles, modeEvaluation: 'competences' })).toEqual({
      ok: false,
      refus: 'competences-sans-blocs',
    });
    expect(verifierReglesValidation({ ...regles, validationBlocs: 'competences' })).toEqual({
      ok: false,
      refus: 'validation-blocs-sans-competences',
    });
    expect(
      verifierReglesValidation({
        ...regles,
        mode: 'blocs',
        modeEvaluation: 'competences',
        validationBlocs: 'notes',
      }),
    ).toEqual({ ok: false, refus: 'validation-blocs-sans-notes' });
    expect(verifierReglesValidation({ ...regles, noteEliminatoire: 10 })).toEqual({
      ok: false,
      refus: 'eliminatoire-au-dessus-du-seuil',
    });
    expect(verifierReglesValidation({ ...regles, noteEliminatoire: 6 })).toEqual({ ok: true });
  });
});

describe('RG-02-27 ordre fixe des règles particulières', () => {
  it('trie pondérations, plafonds, pénalités, bonus puis points de jury', () => {
    const regles: { regle: RegleParticuliere }[] = [
      { regle: { type: 'points_jury', maximum: 0.3, seuils: [] } },
      {
        regle: {
          type: 'bonus',
          valeur: 1,
          unite: 'points',
          cible: { niveau: 'generale' },
          plafond: null,
          automatique: true,
        },
      },
      { regle: { type: 'penalite_absence', typeAbsence: 'injustifiee', note: 0 } },
      { regle: { type: 'plafond', typeEvaluation: 'rattrapage', sens: 'plafond', valeur: 10 } },
      { regle: { type: 'ponderation', poids: [] } },
    ];
    expect(trierRegles(regles).map((r) => r.regle.type)).toEqual([
      'ponderation',
      'plafond',
      'penalite_absence',
      'bonus',
      'points_jury',
    ]);
  });
});
