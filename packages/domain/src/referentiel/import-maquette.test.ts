import { describe, expect, it } from 'vitest';
import {
  COLONNES_COMPETENCES,
  COLONNES_MAQUETTE,
  lireImportCompetences,
  lireImportMaquette,
} from './import-maquette.js';

const ligne = (valeurs: Partial<Record<(typeof COLONNES_MAQUETTE)[number], string>>) =>
  COLONNES_MAQUETTE.map((c) => valeurs[c] ?? '');

describe('US-02-02 import d’une maquette', () => {
  it('lit blocs, UE et modules, une ligne par module, nombres à la virgule', () => {
    const resultat = lireImportMaquette(
      {
        colonnes: [...COLONNES_MAQUETTE],
        lignes: [
          ligne({
            Bloc: 'BC1',
            'Intitulé du bloc': 'Gérer',
            UE: 'UE1',
            'Intitulé de l’UE': 'Gestion',
            Semestre: 'S1',
            ECTS: '18',
            'Coefficient UE': '3',
            Module: 'M1',
            'Intitulé du module': 'Comptabilité',
            CM: '20',
            TD: '10,5',
          }),
          ligne({
            Bloc: 'BC1',
            UE: 'UE1',
            ECTS: '18',
            Module: 'M2',
            'Coefficient module': '2',
            TP: '12',
          }),
          ligne({
            UE: 'UE2',
            'Intitulé de l’UE': 'Langues',
            Semestre: '2',
            ECTS: '12',
            Option: 'Anglais',
          }),
          ligne({ UE: 'UE3', 'Intitulé de l’UE': 'Stage', Semestre: 'S3', Module: 'M9' }),
          ligne({
            UE: 'UE4',
            'Intitulé de l’UE': 'Projet',
            Année: '2',
            Semestre: 'Année',
            Module: 'P1',
            'E-learning': '6',
            Projet: '30',
          }),
          ligne({ UE: 'UE5', Année: '2', Semestre: 'Semestre 4', Module: 'M10' }),
        ],
      },
      2,
    );
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.blocs).toEqual([{ code: 'BC1', intitule: 'Gérer' }]);
    expect(
      resultat.ues.map((u) => [
        u.code,
        u.blocCode,
        u.annee,
        u.semestre,
        u.ects,
        u.coefficient,
        u.option,
      ]),
    ).toEqual([
      ['UE1', 'BC1', 1, 1, 18, 3, null],
      ['UE2', null, 1, 2, 12, 1, 'Anglais'],
      ['UE3', null, 2, 1, 0, 1, null],
      ['UE4', null, 2, null, 0, 1, null],
      ['UE5', null, 2, 2, 0, 1, null],
    ]);
    expect(
      resultat.modules.map((m) => [
        m.code,
        m.ueCode,
        m.coefficient,
        m.heures.cm,
        m.heures.td,
        m.heures.tp,
      ]),
    ).toEqual([
      ['M1', 'UE1', 1, 20, 10.5, 0],
      ['M2', 'UE1', 2, 0, 0, 12],
      ['M9', 'UE3', 1, 0, 0, 0],
      ['P1', 'UE4', 1, 0, 0, 0],
      ['M10', 'UE5', 1, 0, 0, 0],
    ]);
    expect(resultat.modules[3]?.heures).toMatchObject({ projet: 30, elearning: 6 });
    expect(resultat.modules[1]?.intitule).toBe('M2');
    // Section 7 : une UE sans module est créée vide et signalée.
    expect(resultat.uesSansModule).toEqual(['UE2']);
  });

  it('reconnaît les en-têtes sans accent ni majuscule, et ignore les colonnes inconnues', () => {
    const resultat = lireImportMaquette(
      {
        colonnes: ['code ue', 'INTITULE UE', 'Remarque', 'code module', 'Période'],
        lignes: [
          ['UE1', 'Gestion', 'x', 'M1'],
          ['UE2', 'Langues', '', 'M2', 'annuel'],
          ['UE3', 'Stage', '', 'M3', 'Annuelle'],
          ['UE4', 'Court'],
        ],
      },
      1,
    );
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.ues.map((u) => [u.code, u.annee, u.semestre])).toEqual([
      ['UE1', 1, null],
      ['UE2', 1, null],
      ['UE3', 1, null],
      ['UE4', 1, null],
    ]);
    expect(resultat.modules).toHaveLength(3);
  });

  it('signale les colonnes obligatoires absentes et un fichier vide', () => {
    expect(lireImportMaquette({ colonnes: ['Module'], lignes: [['M1']] }, 1).erreurs).toEqual([
      {
        ligne: 1,
        message: 'Colonnes absentes : UE, Intitulé de l’UE. Reprenez le modèle à télécharger.',
      },
    ]);
    expect(lireImportMaquette({ colonnes: ['UE'], lignes: [] }, 1).erreurs[0]?.message).toBe(
      'Colonne absente : Intitulé de l’UE. Reprenez le modèle à télécharger.',
    );
    expect(lireImportMaquette({ colonnes: [...COLONNES_MAQUETTE], lignes: [] }, 1).erreurs).toEqual(
      [{ ligne: 2, message: 'Le fichier ne contient aucune ligne.' }],
    );
  });

  it('rapporte chaque erreur avec son numéro de ligne, sans rien retenir de faux', () => {
    const resultat = lireImportMaquette(
      {
        colonnes: [...COLONNES_MAQUETTE],
        lignes: [
          ligne({ 'Intitulé de l’UE': 'Sans code' }),
          ligne({ UE: 'UE1', Semestre: 'S9' }),
          ligne({ UE: 'UE2', Semestre: 'trois' }),
          ligne({ UE: 'UE3', Année: '1', Semestre: 'S3' }),
          ligne({ UE: 'UE4', Année: '1,5' }),
          ligne({ UE: 'UE5', ECTS: 'beaucoup', 'Coefficient UE': '-1' }),
          ligne({ UE: 'UE6', ECTS: '6', Module: 'M1', 'Coefficient module': 'x', CM: 'dix' }),
          ligne({ UE: 'UE6', ECTS: '7', Module: 'M1' }),
          ligne({ UE: 'UE6', Bloc: 'BC9', Module: 'M2' }),
          ligne({ UE: 'UE6', Module: 'M2' }),
          ligne({ UE: 'UE6', Module: 'M2' }),
          ligne({ UE: 'UE7', Semestre: '0' }),
          ligne({ UE: 'UE8', Semestre: 'S17' }),
          ligne({ UE: 'UE9', Année: 'x' }),
        ],
      },
      2,
    );
    expect(resultat.erreurs).toEqual([
      { ligne: 2, message: 'Le code de l’UE est vide.' },
      { ligne: 3, message: 'L’UE UE1 est en 5e année : la formation dure 2 an(s).' },
      { ligne: 4, message: 'Année ou semestre illisible pour l’UE UE2.' },
      { ligne: 5, message: 'Année ou semestre illisible pour l’UE UE3.' },
      { ligne: 6, message: 'Année ou semestre illisible pour l’UE UE4.' },
      { ligne: 7, message: 'ECTS illisibles pour l’UE UE5.' },
      { ligne: 7, message: 'Coefficient illisible pour l’UE UE5.' },
      { ligne: 8, message: 'Coefficient illisible pour le module M1.' },
      { ligne: 8, message: 'Volumes horaires illisibles pour le module M1.' },
      {
        ligne: 9,
        message: 'L’UE UE6 est décrite différemment sur une ligne précédente (bloc ou ECTS).',
      },
      {
        ligne: 10,
        message: 'L’UE UE6 est décrite différemment sur une ligne précédente (bloc ou ECTS).',
      },
      { ligne: 12, message: 'Le module M2 apparaît deux fois dans l’UE UE6.' },
      { ligne: 13, message: 'Année ou semestre illisible pour l’UE UE7.' },
      { ligne: 14, message: 'Année ou semestre illisible pour l’UE UE8.' },
      { ligne: 15, message: 'Année ou semestre illisible pour l’UE UE9.' },
    ]);
    expect(resultat.ues.map((u) => u.code)).toEqual(['UE6']);
    expect(resultat.modules.map((m) => m.code)).toEqual(['M2']);
  });
});

describe('RG-02-21 import du référentiel de compétences', () => {
  const ligneC = (valeurs: Partial<Record<(typeof COLONNES_COMPETENCES)[number], string>>) =>
    COLONNES_COMPETENCES.map((c) => valeurs[c] ?? '');

  it('lit blocs, compétences, critères et modules', () => {
    const resultat = lireImportCompetences({
      colonnes: [...COLONNES_COMPETENCES],
      lignes: [
        ligneC({
          Bloc: 'BC1',
          'Intitulé du bloc': 'Gérer',
          Compétence: 'C1.1',
          'Intitulé de la compétence': 'Budgéter',
          Critères: 'Budget équilibré ; Écarts expliqués',
          Modules: 'M1, M2',
        }),
        ligneC({ Bloc: 'BC1', Compétence: 'C1.2', 'Intitulé de la compétence': 'Analyser' }),
        ligneC({ Bloc: 'BC2', Compétence: 'C2.1', 'Intitulé de la compétence': 'Communiquer' }),
      ],
    });
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.blocs).toEqual([
      { code: 'BC1', intitule: 'Gérer' },
      { code: 'BC2', intitule: 'BC2' },
    ]);
    expect(resultat.competences[0]).toEqual({
      code: 'C1.1',
      intitule: 'Budgéter',
      blocCode: 'BC1',
      criteres: ['Budget équilibré', 'Écarts expliqués'],
      modules: ['M1', 'M2'],
    });
    expect(resultat.competences[1]).toMatchObject({ criteres: [], modules: [] });
  });

  it('accepte un fichier sans les colonnes facultatives, et des lignes plus courtes', () => {
    const resultat = lireImportCompetences({
      colonnes: ['Bloc', 'Compétence', 'Intitulé de la compétence', 'Critères'],
      lignes: [['BC1', 'C1', 'Budgéter']],
    });
    expect(resultat.competences).toEqual([
      { code: 'C1', intitule: 'Budgéter', blocCode: 'BC1', criteres: [], modules: [] },
    ]);
  });

  it('signale colonnes absentes, lignes incomplètes, doublons et fichier vide', () => {
    expect(lireImportCompetences({ colonnes: ['Bloc'], lignes: [] }).erreurs[0]?.message).toBe(
      'Colonnes absentes : Compétence, Intitulé de la compétence. Reprenez le modèle à télécharger.',
    );
    const resultat = lireImportCompetences({
      colonnes: [...COLONNES_COMPETENCES],
      lignes: [
        ligneC({ Bloc: 'BC1', Compétence: 'C1' }),
        ligneC({ Compétence: 'C1', 'Intitulé de la compétence': 'A' }),
        ligneC({ Bloc: 'BC1', 'Intitulé de la compétence': 'A' }),
        ligneC({ Bloc: 'BC1', Compétence: 'C1', 'Intitulé de la compétence': 'A' }),
        ligneC({ Bloc: 'BC1', Compétence: 'C1', 'Intitulé de la compétence': 'B' }),
      ],
    });
    expect(resultat.erreurs).toEqual([
      { ligne: 2, message: 'Le bloc, le code et l’intitulé de la compétence sont obligatoires.' },
      { ligne: 3, message: 'Le bloc, le code et l’intitulé de la compétence sont obligatoires.' },
      { ligne: 4, message: 'Le bloc, le code et l’intitulé de la compétence sont obligatoires.' },
      { ligne: 6, message: 'La compétence C1 apparaît deux fois dans le bloc BC1.' },
    ]);
    expect(
      lireImportCompetences({ colonnes: [...COLONNES_COMPETENCES], lignes: [] }).erreurs,
    ).toEqual([{ ligne: 2, message: 'Le fichier ne contient aucune ligne.' }]);
  });
});
