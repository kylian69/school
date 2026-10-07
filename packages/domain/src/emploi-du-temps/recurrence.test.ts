import { describe, expect, it } from 'vitest';
import {
  instantLocal,
  occurrencesSerie,
  seancesConcernees,
  verifierAnnulationSeance,
  verifierSerie,
  verifierSuppressionSeance,
  type RegleRecurrence,
} from './recurrence.js';

// Chaque mardi de septembre à décembre 2026, de 9 h à 12 h 30 à Paris.
const regle: RegleRecurrence = {
  dateDebut: '2026-09-01',
  dateFin: '2026-12-15',
  joursSemaine: [2],
  intervalleSemaines: 1,
  heureDebut: '09:00',
  heureFin: '12:30',
  fuseau: 'Europe/Paris',
  sauterJoursEntreprise: false,
};

describe('US-04-02 vérification d’une série', () => {
  it('accepte une règle complète', () => {
    expect(verifierSerie(regle)).toEqual({ ok: true });
  });

  it.each([
    [{ dateDebut: '2026-02-30' }, 'dates-serie'],
    [{ dateDebut: '1er septembre' }, 'dates-serie'],
    [{ dateFin: '2026-13-01' }, 'dates-serie'],
    [{ dateFin: '2026-08-31' }, 'dates-serie'],
    [{ dateFin: '2027-09-02' }, 'duree-serie'],
    [{ joursSemaine: [] }, 'jours-semaine'],
    [{ joursSemaine: [2, 2] }, 'jours-semaine'],
    [{ joursSemaine: [0] }, 'jours-semaine'],
    [{ joursSemaine: [8] }, 'jours-semaine'],
    [{ joursSemaine: [1.5] }, 'jours-semaine'],
    [{ intervalleSemaines: 0 }, 'intervalle'],
    [{ intervalleSemaines: 53 }, 'intervalle'],
    [{ intervalleSemaines: 1.5 }, 'intervalle'],
    [{ heureDebut: '9:00' }, 'heures'],
    [{ heureFin: '24:00' }, 'heures'],
    [{ heureFin: '09:00' }, 'heures'],
    [{ heureDebut: '09:10' }, 'pas-grille'],
    [{ heureFin: '12:20' }, 'pas-grille'],
    [{ fuseau: 'Europe/Atlantide' }, 'fuseau'],
  ] as const)('refuse %o (%s)', (modification, refus) => {
    expect(verifierSerie({ ...regle, ...modification })).toEqual({ ok: false, refus });
  });
});

describe('heures locales et changement d’heure', () => {
  it('convertit une heure de Paris en UTC, en été comme en hiver', () => {
    expect(instantLocal('2026-09-01', '09:00', 'Europe/Paris').toISOString()).toBe(
      '2026-09-01T07:00:00.000Z',
    );
    expect(instantLocal('2026-12-01', '09:00', 'Europe/Paris').toISOString()).toBe(
      '2026-12-01T08:00:00.000Z',
    );
    expect(instantLocal('2026-12-01', '09:00', 'America/Cayenne').toISOString()).toBe(
      '2026-12-01T12:00:00.000Z',
    );
  });

  it('garde la même heure locale de part et d’autre du changement d’heure', () => {
    expect(instantLocal('2026-10-24', '02:30', 'Europe/Paris').toISOString()).toBe(
      '2026-10-24T00:30:00.000Z',
    );
    expect(instantLocal('2026-10-25', '03:30', 'Europe/Paris').toISOString()).toBe(
      '2026-10-25T02:30:00.000Z',
    );
  });

  it('décale une heure qui n’existe pas (passage à l’heure d’été)', () => {
    expect(instantLocal('2027-03-28', '02:30', 'Europe/Paris').toISOString()).toBe(
      '2027-03-28T01:30:00.000Z',
    );
  });
});

describe('RG-04-03 occurrences d’une série', () => {
  it('crée une séance chaque mardi, en sautant les jours fermés', () => {
    const { occurrences, sautees } = occurrencesSerie(regle, {
      fermetures: [
        { dateDebut: '2026-10-24', dateFin: '2026-11-01' },
        { dateDebut: '2026-11-10', dateFin: '2026-11-10' },
      ],
    });
    expect(occurrences).toHaveLength(14);
    expect(occurrences[0]).toEqual({
      jour: '2026-09-01',
      debut: new Date('2026-09-01T07:00:00Z'),
      fin: new Date('2026-09-01T10:30:00Z'),
    });
    // Heure d'hiver : même heure locale, une heure de plus en UTC.
    expect(occurrences.at(-1)).toEqual({
      jour: '2026-12-15',
      debut: new Date('2026-12-15T08:00:00Z'),
      fin: new Date('2026-12-15T11:30:00Z'),
    });
    expect(sautees).toEqual([
      { jour: '2026-10-27', raison: 'fermeture' },
      { jour: '2026-11-10', raison: 'fermeture' },
    ]);
  });

  it('suit un intervalle de N semaines à partir de la semaine du début', () => {
    const { occurrences } = occurrencesSerie(
      {
        ...regle,
        dateDebut: '2026-09-03',
        dateFin: '2026-09-30',
        joursSemaine: [1, 4],
        intervalleSemaines: 2,
      },
      { fermetures: [] },
    );
    // Semaine du jeudi 3 : le lundi 31 août est avant le début ; puis deux semaines plus tard.
    expect(occurrences.map((o) => o.jour)).toEqual([
      '2026-09-03',
      '2026-09-14',
      '2026-09-17',
      '2026-09-28',
    ]);
  });

  it('saute les jours en entreprise seulement si demandé, et les jours exclus', () => {
    const contexte = {
      fermetures: [],
      joursEntreprise: ['2026-09-08'],
      joursExclus: ['2026-09-15'],
    };
    const septembre = { ...regle, dateFin: '2026-09-22' };
    expect(occurrencesSerie(septembre, contexte).sautees).toEqual([
      { jour: '2026-09-15', raison: 'exclu' },
    ]);
    expect(occurrencesSerie({ ...septembre, sauterJoursEntreprise: true }, contexte)).toMatchObject(
      {
        occurrences: [{ jour: '2026-09-01' }, { jour: '2026-09-22' }],
        sautees: [
          { jour: '2026-09-08', raison: 'entreprise' },
          { jour: '2026-09-15', raison: 'exclu' },
        ],
      },
    );
    expect(
      occurrencesSerie({ ...septembre, sauterJoursEntreprise: true }, { fermetures: [] })
        .occurrences,
    ).toHaveLength(4);
  });
});

describe('RG-03 portée d’une modification', () => {
  const serie = [1, 2, 3].map((n) => ({
    id: `s${n}`,
    debut: new Date(`2026-09-0${n}T07:00:00Z`),
    serieId: 'serie',
  }));
  const seule = { id: 'seule', debut: new Date('2026-09-02T07:00:00Z'), serieId: null };
  const seances = [...serie, seule];

  it('s’applique à cette séance, aux suivantes ou à toute la série', () => {
    expect(seancesConcernees(seances, serie[1]!, 'seance')).toEqual([serie[1]]);
    expect(seancesConcernees(seances, serie[1]!, 'suivantes')).toEqual([serie[1], serie[2]]);
    expect(seancesConcernees(seances, serie[1]!, 'serie')).toEqual(serie);
  });

  it('ne touche que la séance si elle n’appartient à aucune série', () => {
    expect(seancesConcernees(seances, seule, 'serie')).toEqual([seule]);
  });
});

describe('RG-04-04 suppression et annulation', () => {
  it('refuse de supprimer une séance avec des présences ou des notes', () => {
    expect(verifierSuppressionSeance({ presences: 0, notes: 0 })).toEqual({ ok: true });
    expect(verifierSuppressionSeance({ presences: 3, notes: 0 })).toEqual({
      ok: false,
      refus: 'seance-utilisee',
    });
    expect(verifierSuppressionSeance({ presences: 0, notes: 1 })).toEqual({
      ok: false,
      refus: 'seance-utilisee',
    });
  });

  it('exige un motif d’annulation', () => {
    expect(verifierAnnulationSeance('Intervenant malade')).toEqual({ ok: true });
    for (const motif of [null, undefined, '  ']) {
      expect(verifierAnnulationSeance(motif)).toEqual({ ok: false, refus: 'motif-requis' });
    }
  });
});
