import { describe, expect, it } from 'vitest';
import {
  absencesDeLAppel,
  changementsAbsences,
  decompteAssiduite,
  estAlternant,
  demiJourneesDeSeance,
  type AbsenceEnregistree,
  type CadreAbsence,
  type LigneAbsence,
} from './absences.js';

// 5 octobre 2026, heure d'été à Paris (UTC+2) ; 2 novembre 2026, heure d'hiver (UTC+1).
const cadre = (debut: string, fin: string, limiteMidi = '13:00'): CadreAbsence => ({
  debut: new Date(debut),
  fin: new Date(fin),
  fuseau: 'Europe/Paris',
  limiteMidi,
});
const matin = cadre('2026-10-05T07:00:00Z', '2026-10-05T10:00:00Z'); // 9 h - 12 h
const apresMidi = cadre('2026-10-05T12:00:00Z', '2026-10-05T15:00:00Z'); // 14 h - 17 h
const journee = cadre('2026-10-05T07:00:00Z', '2026-10-05T15:00:00Z'); // 9 h - 17 h

const ligne = (
  personneId: string,
  statut: LigneAbsence['statut'],
  minutesRetard: number | null = null,
  nonAttendu = false,
): LigneAbsence => ({
  personneId,
  statut,
  minutesRetard,
  nonAttendu,
});

describe('demiJourneesDeSeance', () => {
  it('RG-06-18 une séance du matin ne touche que le matin', () => {
    expect(demiJourneesDeSeance(matin)).toEqual({
      jour: '2026-10-05',
      matin: true,
      apresMidi: false,
    });
  });

  it('RG-06-18 une séance de l’après-midi ne touche que l’après-midi', () => {
    expect(demiJourneesDeSeance(apresMidi)).toEqual({
      jour: '2026-10-05',
      matin: false,
      apresMidi: true,
    });
  });

  it('RG-06-18 une journée touche les deux demi-journées', () => {
    expect(demiJourneesDeSeance(journee)).toEqual({
      jour: '2026-10-05',
      matin: true,
      apresMidi: true,
    });
  });

  it('RG-04-02 la limite matin / après-midi est celle de l’établissement, en heure locale', () => {
    // 12 h - 13 h 30 en hiver : après-midi avec une limite à midi, matin et après-midi à 13 h.
    const midi = cadre('2026-11-02T11:00:00Z', '2026-11-02T12:30:00Z', '12:00');
    expect(demiJourneesDeSeance(midi)).toEqual({
      jour: '2026-11-02',
      matin: false,
      apresMidi: true,
    });
    expect(demiJourneesDeSeance({ ...midi, limiteMidi: '13:00' })).toEqual({
      jour: '2026-11-02',
      matin: true,
      apresMidi: true,
    });
  });

  it('RG-06-18 une séance finissant à la limite reste au matin', () => {
    const jusquaMidi = cadre('2026-10-05T08:00:00Z', '2026-10-05T11:00:00Z');
    expect(demiJourneesDeSeance(jusquaMidi).apresMidi).toBe(false);
  });

  it('RG-06-18 le jour est celui de l’établissement, pas celui d’UTC', () => {
    const tot = cadre('2026-10-04T22:30:00Z', '2026-10-05T00:00:00Z');
    expect(demiJourneesDeSeance(tot).jour).toBe('2026-10-05');
  });
});

describe('absencesDeLAppel', () => {
  it('RG-06-16 un absent manque toute la séance, sur ses demi-journées', () => {
    expect(absencesDeLAppel(journee, [ligne('a', 'absent')])).toEqual([
      {
        personneId: 'a',
        nature: 'absence',
        minutes: 480,
        jour: '2026-10-05',
        matin: true,
        apresMidi: true,
      },
    ]);
  });

  it('RG-06-16 un attendu jamais scanné ni marqué à la validation est absent', () => {
    expect(absencesDeLAppel(matin, [ligne('a', 'en-attente')])).toEqual([
      {
        personneId: 'a',
        nature: 'absence',
        minutes: 180,
        jour: '2026-10-05',
        matin: true,
        apresMidi: false,
      },
    ]);
  });

  it('RG-06-17 un retard manque ses minutes, sur la demi-journée du début de la séance', () => {
    expect(absencesDeLAppel(journee, [ligne('a', 'retard', 25)])).toEqual([
      {
        personneId: 'a',
        nature: 'retard',
        minutes: 25,
        jour: '2026-10-05',
        matin: true,
        apresMidi: false,
      },
    ]);
    expect(absencesDeLAppel(apresMidi, [ligne('a', 'retard', 10)])[0]).toMatchObject({
      matin: false,
      apresMidi: true,
    });
  });

  it('RG-06-17 un retard ne dépasse jamais la durée de la séance', () => {
    expect(absencesDeLAppel(matin, [ligne('a', 'retard', 500)])[0]?.minutes).toBe(180);
  });

  it('RG-06-17 un retard sans minutes n’est pas compté', () => {
    expect(absencesDeLAppel(matin, [ligne('a', 'retard', null), ligne('b', 'retard', 0)])).toEqual(
      [],
    );
  });

  it('RG-06-11 présents et scans à vérifier sans décision n’ont ni absence ni retard', () => {
    expect(absencesDeLAppel(matin, [ligne('a', 'present'), ligne('b', 'a-verifier')])).toEqual([]);
  });

  it('RG-06-16 un apprenant non attendu ajouté n’a ni absence ni retard', () => {
    expect(absencesDeLAppel(matin, [ligne('a', 'absent', null, true)])).toEqual([]);
  });
});

const enregistree = (a: Partial<AbsenceEnregistree>): AbsenceEnregistree => ({
  nature: 'absence',
  minutes: 180,
  statut: 'non-justifiee',
  jour: '2026-10-05',
  matin: true,
  apresMidi: false,
  ...a,
});

describe('decompteAssiduite', () => {
  it('RG-06-18 compte les heures et les demi-journées distinctes', () => {
    const d = decompteAssiduite([
      enregistree({}),
      enregistree({ minutes: 60 }), // deuxième séance du même matin
      enregistree({ matin: false, apresMidi: true, minutes: 120 }),
      enregistree({ jour: '2026-10-06', apresMidi: true, minutes: 480 }),
    ]);
    expect(d).toEqual({
      absences: 4,
      retards: 0,
      minutesAbsence: 840,
      minutesRetard: 0,
      demiJournees: 4,
      demiJourneesNonJustifiees: 4,
    });
  });

  it('RG-06-18 un retard n’est pas une demi-journée d’absence', () => {
    const d = decompteAssiduite([enregistree({ nature: 'retard', minutes: 15 })]);
    expect(d).toMatchObject({ retards: 1, minutesRetard: 15, absences: 0, demiJournees: 0 });
  });

  it('RG-06-21 une demi-journée justifiée sort du compte des non justifiées', () => {
    // Statut des justificatifs (lot suivant) : seules les absences non justifiées comptent ici.
    const justifiee = 'justifiee' as AbsenceEnregistree['statut'];
    const d = decompteAssiduite([
      enregistree({ statut: justifiee }),
      enregistree({ matin: false, apresMidi: true }),
    ]);
    expect(d).toMatchObject({ demiJournees: 2, demiJourneesNonJustifiees: 1 });
  });

  it('RG-06-18 aucune absence : décompte nul', () => {
    expect(decompteAssiduite([])).toMatchObject({ absences: 0, demiJournees: 0 });
  });
});

describe('changementsAbsences', () => {
  const avant = (personneId: string, a: Partial<AbsenceEnregistree> = {}) => ({
    id: `id-${personneId}`,
    personneId,
    ...enregistree(a),
  });

  it('RG-06-15 une correction retire, ajoute ou modifie les absences de la séance', () => {
    const c = changementsAbsences(
      [avant('a'), avant('b'), avant('c')],
      absencesDeLAppel(matin, [
        ligne('a', 'absent'),
        ligne('b', 'retard', 20),
        ligne('c', 'present'),
        ligne('d', 'absent'),
      ]),
    );
    expect(c.ajouts.map((a) => a.personneId)).toEqual(['d']);
    expect(c.modifications.map((m) => [m.avant.id, m.apres.nature])).toEqual([['id-b', 'retard']]);
    expect(c.retraits.map((r) => r.id)).toEqual(['id-c']);
  });

  it('RG-06-21 une absence inchangée garde son statut : rien à écrire', () => {
    const c = changementsAbsences([avant('a')], absencesDeLAppel(matin, [ligne('a', 'absent')]));
    expect(c).toEqual({ ajouts: [], modifications: [], retraits: [] });
  });

  it('RG-06-15 un changement d’horaire ou de demi-journée est une modification', () => {
    const c = changementsAbsences(
      [
        avant('a', { minutes: 180 }),
        avant('b', { jour: '2026-10-04' }),
        avant('e', { apresMidi: true }),
      ],
      absencesDeLAppel(matin, [ligne('a', 'absent'), ligne('b', 'absent'), ligne('e', 'absent')]),
    );
    expect(c.modifications.map((m) => m.avant.id)).toEqual(['id-b', 'id-e']);
    const d = changementsAbsences(
      [avant('a', { matin: false, apresMidi: true })],
      absencesDeLAppel(matin, [ligne('a', 'absent')]),
    );
    expect(d.modifications).toHaveLength(1);
  });
});

describe('estAlternant', () => {
  it('RG-03-15 apprentis et contrats de professionnalisation sont des alternants', () => {
    expect(
      ['apprenti', 'apprenti_sans_employeur', 'professionnalisation'].map(estAlternant),
    ).toEqual([true, true, true]);
    expect([
      estAlternant('initial'),
      estAlternant('formation_continue'),
      estAlternant(null),
      estAlternant(undefined),
    ]).toEqual([false, false, false, false]);
  });
});
