import { describe, expect, it } from 'vitest';
import {
  auPas,
  disposer,
  fondDuJour,
  formatDuree,
  grilleAffichee,
  instantLocal,
  lundiDe,
  numeroSemaine,
  partiesLocales,
} from './semaine';

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

  it('RG-04-02 affiche les jours ouvrés et la plage de l’établissement, élargis aux séances', () => {
    const plage = { debut: '08:30', fin: '17:15', joursOuvres: [2, 3, 6] };
    expect(grilleAffichee('2026-11-02', plage, [])).toEqual({
      jours: ['2026-11-03', '2026-11-04', '2026-11-07'],
      debut: 8 * 60,
      fin: 18 * 60,
    });
    const horsPlage = [{ jour: '2026-11-02', debut: 7 * 60 + 15, fin: 21 * 60 + 30 }];
    expect(grilleAffichee('2026-11-02', plage, horsPlage)).toEqual({
      jours: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07'],
      debut: 7 * 60,
      fin: 22 * 60,
    });
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

describe('fond de la grille', () => {
  const fuseau = 'Europe/Paris';
  it('RG-04-18 place les créneaux du jour et coupe les indisponibilités au jour', () => {
    const disponibilites = {
      creneaux: [
        { jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00' },
        { jourSemaine: 2, heureDebut: '14:00', heureFin: '18:00' },
      ],
      indisponibilites: [{ debut: '2026-10-05T14:00:00Z', fin: '2026-10-07T08:00:00Z' }],
    };
    expect(fondDuJour('2026-10-05', disponibilites, fuseau)).toEqual([
      { nature: 'disponible', debut: 480, fin: 720 },
      { nature: 'indisponible', debut: 960, fin: 1440 },
    ]);
    expect(fondDuJour('2026-10-06', disponibilites, fuseau)).toEqual([
      { nature: 'disponible', debut: 840, fin: 1080 },
      { nature: 'indisponible', debut: 0, fin: 1440 },
    ]);
    expect(fondDuJour('2026-10-07', disponibilites, fuseau)).toEqual([
      { nature: 'indisponible', debut: 0, fin: 600 },
    ]);
    expect(fondDuJour('2026-10-08', disponibilites, fuseau)).toEqual([]);
  });

  it('RG-04-18 garde le motif d’une indisponibilité lu par un gestionnaire', () => {
    const indisponibilites = [
      { debut: '2026-10-05T08:00:00Z', fin: '2026-10-05T10:00:00Z', motif: 'Jury' },
      { debut: '2026-10-05T12:00:00Z', fin: '2026-10-05T13:00:00Z', motif: null },
    ];
    expect(fondDuJour('2026-10-05', { creneaux: [], indisponibilites }, fuseau)).toEqual([
      { nature: 'indisponible', debut: 600, fin: 720, motif: 'Jury' },
      { nature: 'indisponible', debut: 840, fin: 900 },
    ]);
  });

  it('écrit les durées en heures et minutes', () => {
    expect(formatDuree(720)).toBe('12 h');
    expect(formatDuree(90)).toBe('1 h 30');
    expect(formatDuree(45)).toBe('45 min');
  });
});
