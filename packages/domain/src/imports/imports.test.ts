import { describe, expect, it } from 'vitest';
import { ecrireCsv, lireCsv } from './csv.js';
import {
  analyserLignes,
  interpreterDate,
  proposerCorrespondance,
  type Existant,
} from './personnes.js';

const VIDE: Existant = { emails: new Set(), ines: new Set(), matricules: new Set() };

describe('RG-01-17 lecture des fichiers CSV', () => {
  it('détecte le point-virgule, ignore l’indicateur d’ordre des octets et les lignes vides', () => {
    expect(lireCsv('﻿Nom;Prénom\r\nBenali;Inès\r\n\r\n;\r\nMorel;Léo')).toEqual({
      colonnes: ['Nom', 'Prénom'],
      lignes: [
        ['Benali', 'Inès'],
        ['Morel', 'Léo'],
      ],
    });
  });

  it('détecte la virgule, lit les guillemets, guillemets doublés et retours à la ligne', () => {
    expect(lireCsv('nom,adresse\n"Benali","3, rue ""du"" Port\nBât. A"\n')).toEqual({
      colonnes: ['nom', 'adresse'],
      lignes: [['Benali', '3, rue "du" Port\nBât. A']],
    });
  });

  it('lit un fichier réduit à son en-tête, ou vide', () => {
    expect(lireCsv('"nom;complet";email\n')).toEqual({
      colonnes: ['nom;complet', 'email'],
      lignes: [],
    });
    expect(lireCsv('')).toEqual({ colonnes: [], lignes: [] });
  });
});

describe('RG-01-18 correspondance des colonnes', () => {
  it('reconnaît les intitulés usuels, chaque champ une seule fois', () => {
    expect(
      proposerCorrespondance(['NOM', 'Prénom', 'Courriel', 'Né le', 'Nom', 'Remarque']),
    ).toEqual({
      NOM: 'nom',
      Prénom: 'prenom',
      Courriel: 'email',
      'Né le': 'dateNaissance',
      Nom: null,
      Remarque: null,
    });
  });
});

describe('cas limites des dates importées', () => {
  it('lit les dates ISO et françaises sans interprétation', () => {
    expect(interpreterDate('2006-03-14')).toEqual({ date: '2006-03-14', interpretee: false });
    expect(interpreterDate('14/03/2006')).toEqual({ date: '2006-03-14', interpretee: false });
    expect(interpreterDate('3.4.2006')).toEqual({ date: '2006-04-03', interpretee: false });
  });

  it('convertit un format américain sans ambiguïté et une cellule Excel, avec avertissement', () => {
    expect(interpreterDate('03/14/2006')).toEqual({ date: '2006-03-14', interpretee: true });
    expect(interpreterDate('38790')).toEqual({ date: '2006-03-14', interpretee: true });
  });

  it('refuse une date impossible ou illisible', () => {
    expect(interpreterDate('2006-02-30')).toBeNull();
    expect(interpreterDate('31/02/2006')).toBeNull();
    expect(interpreterDate('02/31/2006')).toBeNull();
    expect(interpreterDate('mars 2006')).toBeNull();
  });
});

describe('US-01-05 contrôle ligne par ligne', () => {
  const colonnes = ['Civilité', 'Nom', 'Prénom', 'Email', 'Naissance', 'INE', 'Matricule'];
  const correspondance = proposerCorrespondance(colonnes);

  it('accepte une ligne complète et normalise ses valeurs', () => {
    const [ligne] = analyserLignes(
      colonnes,
      [['Mme', 'Benali', 'Inès', 'Ines.Benali@Exemple.test', '14/03/2006', '0912 345678k', '']],
      correspondance,
      VIDE,
    );
    expect(ligne).toEqual({
      donnees: {
        civilite: 'madame',
        nom: 'Benali',
        prenom: 'Inès',
        email: 'ines.benali@exemple.test',
        dateNaissance: '2006-03-14',
        ine: '0912345678K',
      },
      erreurs: [],
      avertissements: [],
    });
  });

  it('signale chaque erreur et chaque avertissement sur sa ligne', () => {
    const lignes = analyserLignes(
      colonnes,
      [
        ['', '', 'Léo', 'pas-un-email', 'hier', '123', 'M-1'],
        ['Inconnu', 'Morel', 'Léa', 'lea@exemple.test', '03/14/2006', '', ''],
        ['M.', 'Morel', 'Léon', 'LEA@exemple.test', '', '', ''],
        ['', 'Roux', 'Noa', 'noa@exemple.test', '', '0912345678K', ''],
      ],
      correspondance,
      {
        emails: new Set(['noa@exemple.test']),
        ines: new Set(['0912345678K']),
        matricules: new Set(['M-1']),
      },
    );
    expect(lignes.map((l) => l.erreurs.map((e) => e.code))).toEqual([
      ['obligatoire', 'email-invalide', 'date-invalide', 'ine-invalide', 'matricule-pris'],
      [],
      ['email-en-double'],
      [],
    ]);
    expect(lignes.map((l) => l.avertissements)).toEqual([
      [],
      [
        { champ: 'dateNaissance', code: 'date-interpretee', valeur: '2006-03-14' },
        { champ: 'civilite', code: 'civilite-inconnue', valeur: 'Inconnu' },
      ],
      [],
      [{ champ: 'email', code: 'email-existant' }],
    ]);
    expect(lignes[2]?.donnees.civilite).toBe('monsieur');
    expect(lignes[1]?.donnees.civilite).toBeUndefined();
  });

  it('refuse l’INE d’une autre fiche quand l’email est nouveau', () => {
    const [ligne] = analyserLignes(
      colonnes,
      [['', 'Roux', 'Noa', 'nouveau@exemple.test', '', '0912345678K', '']],
      correspondance,
      { ...VIDE, ines: new Set(['0912345678K']) },
    );
    expect(ligne?.erreurs).toEqual([{ champ: 'ine', code: 'ine-existant' }]);
    // Ligne plus courte que l'en-tête, sans email.
    const [courte] = analyserLignes(
      colonnes,
      [['', 'Roux', 'Noa', '', '', '0912345678K']],
      correspondance,
      { ...VIDE, ines: new Set(['0912345678K']) },
    );
    expect(courte?.erreurs.map((e) => e.code)).toEqual(['obligatoire', 'ine-existant']);
  });
});

describe('RG-01-21 écriture des exports CSV', () => {
  it('échappe les guillemets, neutralise les formules et se relit à l’identique', () => {
    const texte = ecrireCsv(
      ['Nom', 'Note'],
      [
        ['Benali "Inès"', '=SOMME(A1:A2)'],
        ['Morel', '-12'],
      ],
    );
    expect(texte.charCodeAt(0)).toBe(0xfeff);
    expect(texte).toContain('"Benali ""Inès""";"\'=SOMME(A1:A2)"');
    expect(lireCsv(texte)).toEqual({
      colonnes: ['Nom', 'Note'],
      lignes: [
        ['Benali "Inès"', "'=SOMME(A1:A2)"],
        ['Morel', "'-12"],
      ],
    });
  });
});
