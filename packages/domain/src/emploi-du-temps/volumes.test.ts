import { describe, expect, it } from 'vitest';
import type { SeancePlanifiee } from './conflits.js';
import { volumesAPlacer } from './volumes.js';

function seance(
  id: string,
  heures: number,
  autres: Partial<SeancePlanifiee> = {},
): SeancePlanifiee {
  const debut = new Date('2026-10-05T07:00:00Z');
  return {
    id,
    debut,
    fin: new Date(debut.getTime() + heures * 3_600_000),
    statut: 'publiee',
    type: 'cm',
    moduleId: 'M1',
    salleId: null,
    intervenantIds: [],
    groupeIds: ['P1'],
    ...autres,
  };
}

const volumes = { M1: { cm: 600, td: 300, tp: 0, projet: 0 }, M2: { cm: 120 } };

describe('volumesAPlacer', () => {
  it('RG-04-16 donne le restant par module et par type, brouillons compris', () => {
    const resultat = volumesAPlacer(
      ['M1', 'M2'],
      volumes,
      [seance('a', 3), seance('b', 2, { statut: 'brouillon' }), seance('c', 1, { type: 'td' })],
      ['P1'],
    );
    expect(resultat).toEqual([
      { moduleId: 'M1', type: 'cm', prevuMinutes: 600, planifieMinutes: 300, restantMinutes: 300 },
      { moduleId: 'M1', type: 'td', prevuMinutes: 300, planifieMinutes: 60, restantMinutes: 240 },
      { moduleId: 'M2', type: 'cm', prevuMinutes: 120, planifieMinutes: 0, restantMinutes: 120 },
    ]);
  });

  it('RG-04-16 ignore les séances annulées, reportées et celles d’un autre public', () => {
    const resultat = volumesAPlacer(
      ['M2'],
      volumes,
      [
        seance('a', 1, { moduleId: 'M2', statut: 'annulee' }),
        seance('b', 1, { moduleId: 'M2', statut: 'reportee' }),
        seance('c', 1, { moduleId: 'M2', groupeIds: ['G9'] }),
      ],
      ['P1'],
    );
    expect(resultat).toEqual([
      { moduleId: 'M2', type: 'cm', prevuMinutes: 120, planifieMinutes: 0, restantMinutes: 120 },
    ]);
  });

  it('RG-04-16 compte une fois une séance de plusieurs publics suivis', () => {
    const [ligne] = volumesAPlacer(
      ['M2'],
      volumes,
      [seance('a', 1, { moduleId: 'M2', groupeIds: ['P1', 'G1'] })],
      ['P1', 'G1'],
    );
    expect(ligne?.planifieMinutes).toBe(60);
  });

  it('RG-04-16 signale un dépassement et un type planifié sans heures prévues', () => {
    const resultat = volumesAPlacer(
      ['M2', 'M3'],
      volumes,
      [
        seance('a', 3, { moduleId: 'M2' }),
        seance('b', 2, { moduleId: 'M2', type: 'examen' }),
        seance('c', 1, { moduleId: 'M3' }),
      ],
      ['P1'],
    );
    expect(resultat).toEqual([
      { moduleId: 'M2', type: 'cm', prevuMinutes: 120, planifieMinutes: 180, restantMinutes: -60 },
      {
        moduleId: 'M2',
        type: 'examen',
        prevuMinutes: 0,
        planifieMinutes: 120,
        restantMinutes: -120,
      },
      { moduleId: 'M3', type: 'cm', prevuMinutes: 0, planifieMinutes: 60, restantMinutes: -60 },
    ]);
  });
});
