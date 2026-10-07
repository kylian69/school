import { describe, expect, it } from 'vitest';
import {
  depasseCapaciteMaitre,
  lireFicheAnnuaire,
  normaliserIdcc,
  opcoPropose,
} from './entreprises.js';

const regles = { apprentisParMaitre: 2, apprentisSupplementairesProlonges: 1 };

describe('RG-03-02 IDCC et OPCO', () => {
  it('normalise l’IDCC sur 4 chiffres et refuse le reste', () => {
    expect(normaliserIdcc('16')).toBe('0016');
    expect(normaliserIdcc(' 1486 ')).toBe('1486');
    expect(normaliserIdcc('12345')).toBeNull();
    expect(normaliserIdcc('ABC')).toBeNull();
    expect(normaliserIdcc(null)).toBeNull();
  });
  it('propose l’OPCO de la convention, sinon rien', () => {
    expect(opcoPropose('1486', { '1486': 'atlas' })).toBe('atlas');
    expect(opcoPropose('9999', { '1486': 'atlas' })).toBeNull();
    expect(opcoPropose(null, { '1486': 'atlas' })).toBeNull();
  });
});

describe('RG-03-01 fiche de l’annuaire public', () => {
  const reponse = {
    results: [
      {
        siren: '123456789',
        nom_complet: 'ATELIERS FICTIFS',
        activite_principale: '62.01Z',
        tranche_effectif_salarie: '12',
        complements: { liste_idcc: ['1486'] },
        siege: {
          siret: '12345678900011',
          adresse: '1 rue du Siège',
          code_postal: '99100',
          libelle_commune: 'LUMERAC',
          etat_administratif: 'A',
        },
        matching_etablissements: [
          {
            siret: '12345678900029',
            adresse: '2 quai Fictif',
            code_postal: '99200',
            libelle_commune: 'LUMERAC-SUR-ORNE',
            activite_principale: '62.02A',
            etat_administratif: 'F',
            liste_idcc: ['16', 'x'],
          },
        ],
      },
    ],
  };
  it('retrouve un établissement secondaire, fermé, avec ses conventions', () => {
    expect(lireFicheAnnuaire(reponse, '12345678900029')).toEqual({
      siret: '12345678900029',
      siren: '123456789',
      raisonSociale: 'ATELIERS FICTIFS',
      adresse: '2 quai Fictif',
      codePostal: '99200',
      ville: 'LUMERAC-SUR-ORNE',
      naf: '62.02A',
      effectif: '12',
      ferme: true,
      idcc: ['0016', '1486'],
    });
  });
  it('retrouve le siège ; nom de raison sociale prioritaire', () => {
    const fiche = lireFicheAnnuaire(
      {
        results: [
          {
            ...reponse.results[0],
            nom_raison_sociale: 'ATELIERS FICTIFS SAS',
            matching_etablissements: undefined,
          },
        ],
      },
      '12345678900011',
    );
    expect(fiche).toMatchObject({
      raisonSociale: 'ATELIERS FICTIFS SAS',
      ville: 'LUMERAC',
      naf: '62.01Z',
      ferme: false,
    });
  });
  it('tolère une réponse partielle ou inattendue', () => {
    expect(
      lireFicheAnnuaire({ results: [{ siege: { siret: '12345678900011' } }] }, '12345678900011'),
    ).toEqual({
      siret: '12345678900011',
      siren: '123456789',
      raisonSociale: '123456789',
      adresse: null,
      codePostal: null,
      ville: null,
      naf: null,
      effectif: null,
      ferme: false,
      idcc: [],
    });
    expect(lireFicheAnnuaire({ results: [] }, '12345678900011')).toBeNull();
    expect(lireFicheAnnuaire(null, '12345678900011')).toBeNull();
    expect(lireFicheAnnuaire({ results: [null, 'x'] }, '12345678900011')).toBeNull();
  });
});

describe('RG-03-04 capacité d’un maître d’apprentissage', () => {
  it('accepte deux apprentis plus un prolongé, pas davantage', () => {
    expect(depasseCapaciteMaitre([{ prolonge: false }, { prolonge: false }], regles)).toBe(false);
    expect(
      depasseCapaciteMaitre([{ prolonge: false }, { prolonge: false }, { prolonge: true }], regles),
    ).toBe(false);
    expect(
      depasseCapaciteMaitre(
        [{ prolonge: false }, { prolonge: false }, { prolonge: false }],
        regles,
      ),
    ).toBe(true);
    expect(
      depasseCapaciteMaitre(
        [{ prolonge: false }, { prolonge: false }, { prolonge: true }, { prolonge: true }],
        regles,
      ),
    ).toBe(true);
  });
});
