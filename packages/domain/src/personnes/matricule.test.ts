import { describe, expect, it } from 'vitest';
import {
  analyserModeleMatricule,
  controlerIne,
  genererMatricule,
  MODELE_MATRICULE_PAR_DEFAUT,
} from './matricule.js';

describe('RG-01-06 matricule et INE', () => {
  it('accepte un modèle avec un seul numéro séquentiel', () => {
    expect(analyserModeleMatricule(MODELE_MATRICULE_PAR_DEFAUT)).toEqual({ ok: true });
    expect(analyserModeleMatricule('{ANNEE}-{NUM:5}')).toEqual({ ok: true });
    expect(analyserModeleMatricule('EGL{AA}/{NUM:4}')).toEqual({ ok: true });
  });

  it('refuse un modèle sans numéro, à deux numéros, inconnu ou trop long', () => {
    expect(analyserModeleMatricule('{ANNEE}')).toEqual({ ok: false, refus: 'numero-absent' });
    expect(analyserModeleMatricule('{NUM:3}{NUM:3}')).toEqual({
      ok: false,
      refus: 'numero-multiple',
    });
    expect(analyserModeleMatricule('{ETAB}{NUM:4}')).toEqual({ ok: false, refus: 'jeton-inconnu' });
    expect(analyserModeleMatricule('a{NUM:4}')).toEqual({ ok: false, refus: 'jeton-inconnu' });
    expect(analyserModeleMatricule('{NUM:0}')).toEqual({ ok: false, refus: 'jeton-inconnu' });
    expect(analyserModeleMatricule('{NUM:11}')).toEqual({ ok: false, refus: 'jeton-inconnu' });
    expect(analyserModeleMatricule(`${'X'.repeat(25)}{NUM:5}`)).toEqual({
      ok: false,
      refus: 'trop-long',
    });
  });

  it('génère le matricule d’après le modèle', () => {
    expect(genererMatricule('{NUM:6}', { annee: 2026, numero: 42 })).toBe('000042');
    expect(genererMatricule('{ANNEE}-{NUM:5}', { annee: 2026, numero: 7 })).toBe('2026-00007');
    expect(genererMatricule('EGL{AA}/{NUM:3}', { annee: 2007, numero: 1234 })).toBe('EGL07/1234');
  });

  it('contrôle l’INE : 11 caractères, une lettre à la fin', () => {
    expect(controlerIne('0912345678K')).toBe('valide');
    expect(controlerIne('1A2B3C4D5EF')).toBe('valide');
    expect(controlerIne('09123456789')).toBe('format');
    expect(controlerIne('0912345678')).toBe('format');
  });
});
