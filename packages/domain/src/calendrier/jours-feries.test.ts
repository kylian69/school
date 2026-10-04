import { describe, expect, it } from 'vitest';
import { dimancheDePaques, joursFeries, type RegleJourFerie } from './jours-feries.js';

describe('RG-01-04 jours fériés calculés, y compris Pâques', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
    [2285, '2285-03-22'],
  ])('Pâques %i tombe le %s', (annee, attendu) => {
    expect(dimancheDePaques(annee)).toBe(attendu);
  });

  it('refuse une année hors du calendrier grégorien', () => {
    expect(() => dimancheDePaques(1500)).toThrow(RangeError);
    expect(() => dimancheDePaques(2026.5)).toThrow(RangeError);
  });

  it('applique dates fixes et décalages par rapport à Pâques, triés par date', () => {
    const regles: RegleJourFerie[] = [
      { code: 'noel', libelle: 'Noël', type: 'fixe', mois: 12, jour: 25 },
      { code: 'ascension', libelle: 'Ascension', type: 'paques', decalage: 39 },
      { code: 'jour-de-l-an', libelle: "Jour de l'an", type: 'fixe', mois: 1, jour: 1 },
      { code: 'lundi-de-pentecote', libelle: 'Lundi de Pentecôte', type: 'paques', decalage: 50 },
    ];
    expect(joursFeries(2027, regles)).toEqual([
      { code: 'jour-de-l-an', libelle: "Jour de l'an", date: '2027-01-01' },
      { code: 'ascension', libelle: 'Ascension', date: '2027-05-06' },
      { code: 'lundi-de-pentecote', libelle: 'Lundi de Pentecôte', date: '2027-05-17' },
      { code: 'noel', libelle: 'Noël', date: '2027-12-25' },
    ]);
  });
});
