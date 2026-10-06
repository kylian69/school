import { describe, expect, it } from 'vitest';
import { informationsManquantes, verifierArchivageEtablissement } from './etablissements.js';
import {
  controlerNda,
  controlerSiren,
  controlerSiret,
  controlerUai,
  normaliserIdentifiant,
} from './identifiants.js';

describe('RG-01-02 contrôle des identifiants', () => {
  it('contrôle le format et la clé de l’UAI', () => {
    expect(controlerUai('0750654D')).toBe('valide');
    expect(controlerUai('0130040Y')).toBe('valide');
    expect(controlerUai('0750654E')).toBe('cle');
    expect(controlerUai('075065D')).toBe('format');
    expect(controlerUai('0750654d')).toBe('format');
  });

  it('contrôle le SIREN par la clé de Luhn', () => {
    expect(controlerSiren('732829320')).toBe('valide');
    expect(controlerSiren('732829321')).toBe('cle');
    expect(controlerSiren('73282932')).toBe('format');
  });

  it('contrôle le SIRET par la clé de Luhn', () => {
    expect(controlerSiret('73282932000074')).toBe('valide');
    expect(controlerSiret('73282932000075')).toBe('cle');
    expect(controlerSiret('7328293200007')).toBe('format');
    expect(controlerSiret('7328293200007A')).toBe('format');
  });

  it('applique la règle particulière des établissements de La Poste', () => {
    expect(controlerSiret('35600000000048')).toBe('valide');
    expect(controlerSiret('35600000049837')).toBe('valide');
    expect(controlerSiret('35600000049838')).toBe('cle');
  });

  it('contrôle le format du NDA', () => {
    expect(controlerNda('11755555575')).toBe('valide');
    expect(controlerNda('1175555557')).toBe('format');
  });

  it('normalise la saisie', () => {
    expect(normaliserIdentifiant(' 732 829 320 ')).toBe('732829320');
    expect(normaliserIdentifiant('0750654d')).toBe('0750654D');
    expect(normaliserIdentifiant('  ')).toBeNull();
    expect(normaliserIdentifiant(null)).toBeNull();
    expect(normaliserIdentifiant(undefined)).toBeNull();
  });
});

describe('RG-01-01 établissements', () => {
  it('refuse d’archiver le dernier établissement actif', () => {
    expect(verifierArchivageEtablissement(2)).toEqual({ ok: true });
    expect(verifierArchivageEtablissement(1)).toEqual({
      ok: false,
      refus: 'dernier-etablissement-actif',
    });
  });

  it('RG-01-02 signale les informations manquantes', () => {
    const complet = {
      adresseLigne1: '1 rue Fictive',
      codePostal: '69000',
      ville: 'Lumerac',
      uai: '0750654D',
      siret: '73282932000074',
      nda: '11755555575',
    };
    expect(informationsManquantes(complet)).toEqual([]);
    expect(
      informationsManquantes({ ...complet, ville: null, uai: null, siret: null, nda: null }),
    ).toEqual(['adresse', 'uai', 'siret', 'nda']);
    expect(informationsManquantes({ ...complet, adresseLigne1: null })).toEqual(['adresse']);
    expect(informationsManquantes({ ...complet, codePostal: null })).toEqual(['adresse']);
  });
});
