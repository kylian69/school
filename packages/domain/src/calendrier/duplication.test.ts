import { describe, expect, it } from 'vitest';
import { anneeSuivante, libelleSuivant, proposerDuplication } from './duplication.js';

describe('US-01-04 et RG-01-05 duplication de l’année', () => {
  it('décale une date d’un an, le 29 février compris', () => {
    expect(anneeSuivante('2026-09-01')).toBe('2027-09-01');
    expect(anneeSuivante('2028-02-29')).toBe('2029-02-28');
    expect(anneeSuivante('2027-03-01')).toBe('2028-03-01');
    expect(anneeSuivante('2099-02-28')).toBe('2100-02-28');
    expect(anneeSuivante('2399-02-29')).toBe('2400-02-29');
  });

  it('fait avancer les millésimes du libellé', () => {
    expect(libelleSuivant('2026-2027')).toBe('2027-2028');
    expect(libelleSuivant('Année 2026/27')).toBe('Année 2027/27');
    expect(libelleSuivant('Promotion d’octobre')).toBe('Promotion d’octobre');
  });

  it('propose l’année suivante avec ses périodes et ses fermetures décalées', () => {
    const proposition = proposerDuplication({
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
      periodes: [{ libelle: 'S1', dateDebut: '2026-09-01', dateFin: '2027-01-31', ordre: 1 }],
      fermetures: [
        { libelle: 'Toussaint', dateDebut: '2026-10-24', dateFin: '2026-11-01', type: 'vacances' },
      ],
    });
    expect(proposition).toEqual({
      libelle: '2027-2028',
      dateDebut: '2027-09-01',
      dateFin: '2028-08-31',
      periodes: [{ libelle: 'S1', dateDebut: '2027-09-01', dateFin: '2028-01-31', ordre: 1 }],
      fermetures: [
        { libelle: 'Toussaint', dateDebut: '2027-10-24', dateFin: '2027-11-01', type: 'vacances' },
      ],
    });
  });
});
