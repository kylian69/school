import { describe, expect, it } from 'vitest';
import { joursFeriesNationauxDe } from './jours-feries.js';

describe('RG-01-04 jours fériés pré-remplis chaque année', () => {
  it('2027 compte les 11 jours fériés nationaux, Pâques comprise', () => {
    const jours = joursFeriesNationauxDe(2027);
    expect(jours).toHaveLength(11);
    expect(jours.map((j) => j.date)).toEqual([
      '2027-01-01',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-08',
      '2027-05-17',
      '2027-07-14',
      '2027-08-15',
      '2027-11-01',
      '2027-11-11',
      '2027-12-25',
    ]);
  });

  it('explique quoi faire pour une année sans règle en vigueur', () => {
    expect(() => joursFeriesNationauxDe(2000)).toThrow(/packages\/referentials/);
  });
});
