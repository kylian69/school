import { describe, expect, it } from 'vitest';
import { heuresVides } from '../referentiel/maquette.js';
import { ecartsHeures, totalAffecte } from './affectations.js';

const h = (cm: number, td = 0) => ({ ...heuresVides(), cm, td });

describe('RG-02-18 heures affectées et écarts', () => {
  it('additionne les heures de plusieurs intervenants', () => {
    expect(totalAffecte([{ heures: h(10, 5.5) }, { heures: h(10, 4.25) }])).toMatchObject({
      cm: 20,
      td: 9.75,
    });
  });

  it('signale les heures restant à affecter et celles affectées en trop', () => {
    expect(ecartsHeures(h(20, 10), [{ heures: h(20, 12) }])).toEqual([
      { type: 'td', prevu: 10, affecte: 12, ecart: 2 },
    ]);
    expect(ecartsHeures(h(20, 10), [])).toEqual([
      { type: 'cm', prevu: 20, affecte: 0, ecart: -20 },
      { type: 'td', prevu: 10, affecte: 0, ecart: -10 },
    ]);
    expect(ecartsHeures(h(20, 10), [{ heures: h(15) }, { heures: h(5, 10) }])).toEqual([]);
  });
});
