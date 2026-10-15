import { describe, expect, it } from 'vitest';
import type { AbsenceEnregistree } from './absences.js';
import {
  alertesADeclencher,
  debutFenetre,
  evaluerAssiduite,
  niveauAtteint,
  SEUILS_ASSIDUITE_DEFAUT,
  seuilsApplicables,
  seuilsValides,
  type SeuilsAssiduite,
} from './seuils.js';

const absence = (
  jour: string,
  demi: 'matin' | 'apres-midi' | 'journee',
  statut: AbsenceEnregistree['statut'] = 'non-justifiee',
  nature: AbsenceEnregistree['nature'] = 'absence',
): AbsenceEnregistree => ({
  jour,
  matin: demi !== 'apres-midi',
  apresMidi: demi !== 'matin',
  nature,
  minutes: 180,
  statut,
});

describe('RG-06-23 seuils applicables', () => {
  const ecole: SeuilsAssiduite = { niveau1: 4, niveau2: 8, fenetreJours: 60 };

  it('RG-06-23 reprend 3 puis 6 demi-journées sur 30 jours par défaut', () => {
    expect(seuilsApplicables(null, [])).toEqual({ niveau1: 3, niveau2: 6, fenetreJours: 30 });
    expect(seuilsApplicables(null, [null])).toBe(SEUILS_ASSIDUITE_DEFAUT);
  });

  it("RG-06-23 applique les seuils de l'école, sauf si la formation définit les siens", () => {
    expect(seuilsApplicables(ecole, [null])).toBe(ecole);
    const formation = { niveau1: 2, niveau2: 5, fenetreJours: 30 };
    expect(seuilsApplicables(ecole, [null, formation])).toBe(formation);
  });

  it('RG-06-23 retient les seuils les plus exigeants entre plusieurs formations', () => {
    const a = { niveau1: 3, niveau2: 6, fenetreJours: 30 };
    const b = { niveau1: 3, niveau2: 5, fenetreJours: 30 };
    const c = { niveau1: 3, niveau2: 5, fenetreJours: 45 };
    expect(seuilsApplicables(null, [a, b])).toBe(b);
    expect(seuilsApplicables(null, [b, c])).toBe(c);
    expect(seuilsApplicables(null, [c, { niveau1: 2, niveau2: 9, fenetreJours: 7 }]).niveau1).toBe(
      2,
    );
  });

  it('refuse des seuils incohérents ou hors bornes', () => {
    expect(seuilsValides(SEUILS_ASSIDUITE_DEFAUT)).toBe(true);
    expect(seuilsValides({ niveau1: 6, niveau2: 6, fenetreJours: 30 })).toBe(false);
    expect(seuilsValides({ niveau1: 0, niveau2: 6, fenetreJours: 30 })).toBe(false);
    expect(seuilsValides({ niveau1: 1, niveau2: 101, fenetreJours: 30 })).toBe(false);
    expect(seuilsValides({ niveau1: 1, niveau2: 2, fenetreJours: 6 })).toBe(false);
    expect(seuilsValides({ niveau1: 1, niveau2: 2, fenetreJours: 366 })).toBe(false);
    expect(seuilsValides({ niveau1: 1.5, niveau2: 2, fenetreJours: 30 })).toBe(false);
  });
});

describe('RG-06-23 période glissante et niveau', () => {
  it('RG-06-23 compte 30 jours aujourd’hui compris', () => {
    expect(debutFenetre('2026-10-30', 30)).toBe('2026-10-01');
    expect(debutFenetre('2026-03-01', 7)).toBe('2026-02-23');
  });

  it('RG-06-23 atteint le niveau 1 puis le niveau 2 à leur seuil exact', () => {
    expect(niveauAtteint(2, SEUILS_ASSIDUITE_DEFAUT)).toBe(0);
    expect(niveauAtteint(3, SEUILS_ASSIDUITE_DEFAUT)).toBe(1);
    expect(niveauAtteint(5, SEUILS_ASSIDUITE_DEFAUT)).toBe(1);
    expect(niveauAtteint(6, SEUILS_ASSIDUITE_DEFAUT)).toBe(2);
  });

  it('RG-06-23 ne compte que les demi-journées non justifiées de la période', () => {
    const absences = [
      absence('2026-09-30', 'journee'), // hors période
      absence('2026-10-01', 'matin'),
      absence('2026-10-05', 'journee'),
      absence('2026-10-06', 'matin', 'justifiee'),
      absence('2026-10-07', 'matin', 'non-justifiee', 'retard'),
      absence('2026-10-31', 'journee'), // après aujourd'hui
    ];
    expect(evaluerAssiduite(absences, SEUILS_ASSIDUITE_DEFAUT, '2026-10-30')).toEqual({
      du: '2026-10-01',
      au: '2026-10-30',
      demiJourneesNonJustifiees: 3,
      niveau: 1,
    });
  });
});

describe('RG-06-23 alertes sans rafale', () => {
  const maintenant = new Date('2026-10-30T10:00:00Z');
  const il = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000);

  it('RG-06-23 ne déclenche rien sous les seuils', () => {
    expect(alertesADeclencher(0, [], maintenant, 30)).toEqual([]);
  });

  it('RG-06-23 déclenche le niveau 1, puis le niveau 2 en passant par le niveau 1', () => {
    expect(alertesADeclencher(1, [], maintenant, 30)).toEqual([1]);
    expect(alertesADeclencher(2, [], maintenant, 30)).toEqual([1, 2]);
    expect(alertesADeclencher(2, [{ niveau: 1, declencheeLe: il(3) }], maintenant, 30)).toEqual([
      2,
    ]);
  });

  it('RG-06-23 ne répète pas une alerte du même niveau pendant la période', () => {
    const emises = [
      { niveau: 1, declencheeLe: il(29) },
      { niveau: 2, declencheeLe: il(1) },
    ];
    expect(alertesADeclencher(2, emises, maintenant, 30)).toEqual([]);
  });

  it('RG-06-23 alerte de nouveau une fois la période écoulée', () => {
    expect(alertesADeclencher(1, [{ niveau: 1, declencheeLe: il(30) }], maintenant, 30)).toEqual([
      1,
    ]);
  });
});
