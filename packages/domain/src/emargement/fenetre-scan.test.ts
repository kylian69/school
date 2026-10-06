import { describe, expect, it } from 'vitest';
import { evaluerScan } from './fenetre-scan.js';

const debut = Date.UTC(2026, 9, 6, 8, 0);
const minutes = (n: number) => debut + n * 60_000;

describe('RG-06-02 fenêtre de scan', () => {
  it('ouvre 10 minutes avant le début et ferme 15 minutes après', () => {
    expect(evaluerScan(debut, minutes(-11))).toEqual({ ok: false, refus: 'trop-tot' });
    expect(evaluerScan(debut, minutes(-10))).toEqual({ ok: true, retardMinutes: 0 });
    expect(evaluerScan(debut, minutes(15))).toMatchObject({ ok: true });
    expect(evaluerScan(debut, minutes(15) + 1)).toEqual({ ok: false, refus: 'trop-tard' });
  });

  it('compte un retard au-delà de 5 minutes de tolérance, en minutes depuis le début', () => {
    expect(evaluerScan(debut, minutes(5))).toEqual({ ok: true, retardMinutes: 0 });
    expect(evaluerScan(debut, minutes(5) + 1)).toEqual({ ok: true, retardMinutes: 6 });
    expect(evaluerScan(debut, minutes(12))).toEqual({ ok: true, retardMinutes: 12 });
  });

  it('suit les durées paramétrées par la formation', () => {
    const regles = {
      ouvertureAvantMinutes: 0,
      fermetureApresMinutes: 30,
      toleranceRetardMinutes: 0,
    };
    expect(evaluerScan(debut, minutes(-1), regles)).toEqual({ ok: false, refus: 'trop-tot' });
    expect(evaluerScan(debut, minutes(25), regles)).toEqual({ ok: true, retardMinutes: 25 });
  });
});
