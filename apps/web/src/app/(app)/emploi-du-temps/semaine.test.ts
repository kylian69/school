import { describe, expect, it } from 'vitest';
import { auPas, disposer, instantLocal, lundiDe, numeroSemaine, partiesLocales } from './semaine';

describe('grille de l’emploi du temps', () => {
  it('trouve le lundi et le numéro ISO de la semaine', () => {
    expect(lundiDe('2026-10-08')).toBe('2026-10-05');
    expect(lundiDe('2026-10-05')).toBe('2026-10-05');
    expect(lundiDe('2026-10-11')).toBe('2026-10-05');
    expect(numeroSemaine('2026-10-05')).toBe(41);
    expect(numeroSemaine('2027-01-01')).toBe(53);
  });

  it('convertit les heures locales de l’établissement, heure d’été et d’hiver comprises', () => {
    expect(instantLocal('2026-10-05', '09:00', 'Europe/Paris')).toBe('2026-10-05T07:00:00.000Z');
    expect(instantLocal('2026-12-07', '09:00', 'Europe/Paris')).toBe('2026-12-07T08:00:00.000Z');
    expect(instantLocal('2026-10-05', '09:00', 'America/Cayenne')).toBe('2026-10-05T12:00:00.000Z');
    expect(partiesLocales('2026-10-25T08:30:00.000Z', 'Europe/Paris')).toEqual({
      jour: '2026-10-25',
      minutes: 9 * 60 + 30,
    });
  });

  it('RG-04-02 arrondit au pas de 15 minutes', () => {
    expect(auPas(9 * 60 + 7)).toBe(9 * 60 + 0);
    expect(auPas(9 * 60 + 8)).toBe(9 * 60 + 15);
  });

  it('range côte à côte les séances qui se chevauchent', () => {
    const places = disposer([
      { id: 'a', debut: 540, fin: 720 },
      { id: 'b', debut: 600, fin: 660 },
      { id: 'c', debut: 780, fin: 900 },
    ]);
    const parId = Object.fromEntries(places.map((p) => [p.id, [p.colonne, p.colonnes]]));
    expect(parId).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});
