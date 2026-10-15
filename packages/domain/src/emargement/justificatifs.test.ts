import { describe, expect, it } from 'vitest';
import {
  absenceJustifiable,
  deciderJustificatif,
  depotHorsDelai,
  documentModifiable,
  JUSTIFICATIF_DELAI_HEURES,
  statutAbsenceApres,
} from './justificatifs.js';

const fin = new Date('2026-10-05T15:00:00Z');
const apres = (heures: number) => new Date(fin.getTime() + heures * 3_600_000);

describe('justificatifs d’absence', () => {
  it('RG-06-19 signale un dépôt après le délai, compté depuis la plus ancienne séance', () => {
    expect(depotHorsDelai([fin], apres(48), JUSTIFICATIF_DELAI_HEURES)).toBe(false);
    expect(depotHorsDelai([fin], apres(48.1), JUSTIFICATIF_DELAI_HEURES)).toBe(true);
    expect(depotHorsDelai([apres(24), fin], apres(60), 72)).toBe(false);
    expect(depotHorsDelai([apres(24), fin], apres(60), 48)).toBe(true);
    expect(depotHorsDelai([], apres(1000), 48)).toBe(false);
  });

  it('RG-06-19 un nouveau justificatif n’est possible qu’après un refus', () => {
    expect(absenceJustifiable('non-justifiee', [])).toBe(true);
    expect(absenceJustifiable('non-justifiee', ['refuse'])).toBe(true);
    expect(absenceJustifiable('non-justifiee', ['refuse', 'a-traiter'])).toBe(false);
    expect(absenceJustifiable('non-justifiee', ['complement-demande'])).toBe(false);
    expect(absenceJustifiable('justifiee', [])).toBe(false);
  });

  it('le document se complète tant que le justificatif n’est pas décidé', () => {
    expect(documentModifiable('a-traiter')).toBe(true);
    expect(documentModifiable('complement-demande')).toBe(true);
    expect(documentModifiable('accepte')).toBe(false);
    expect(documentModifiable('refuse')).toBe(false);
  });

  it('RG-06-21 accepte, refuse avec un motif ou demande un complément', () => {
    expect(deciderJustificatif('a-traiter', 'accepter', null)).toEqual({
      ok: true,
      statut: 'accepte',
    });
    expect(deciderJustificatif('complement-demande', 'refuser', 'Illisible')).toEqual({
      ok: true,
      statut: 'refuse',
    });
    expect(deciderJustificatif('a-traiter', 'completer', 'Page 2 manquante')).toEqual({
      ok: true,
      statut: 'complement-demande',
    });
    expect(deciderJustificatif('a-traiter', 'refuser', '  ')).toEqual({
      ok: false,
      refus: 'message-requis',
    });
    expect(deciderJustificatif('a-traiter', 'completer', null)).toEqual({
      ok: false,
      refus: 'message-requis',
    });
    expect(deciderJustificatif('accepte', 'refuser', 'Trop tard')).toEqual({
      ok: false,
      refus: 'deja-decide',
    });
  });

  it('RG-06-21 seule l’acceptation justifie les absences', () => {
    expect(statutAbsenceApres('accepte')).toBe('justifiee');
    expect(statutAbsenceApres('refuse')).toBe('non-justifiee');
    expect(statutAbsenceApres('a-traiter')).toBe('non-justifiee');
  });
});
