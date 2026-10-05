import { describe, expect, it } from 'vitest';
import {
  joursFeriesEntre,
  verifierAnnee,
  verifierFermeture,
  verifierModificationAnnee,
  verifierSuppressionAnnee,
} from './annee.js';
import type { RegleJourFerie } from './jours-feries.js';

const annee = { dateDebut: '2026-09-01', dateFin: '2027-08-31' };
const s1 = { dateDebut: '2026-09-01', dateFin: '2027-01-31' };
const s2 = { dateDebut: '2027-02-01', dateFin: '2027-07-10' };

describe('RG-01-03 année scolaire et périodes', () => {
  it('accepte une année avec deux semestres, dans n’importe quel ordre', () => {
    expect(verifierAnnee(annee, [s1, s2])).toEqual({ ok: true });
    expect(verifierAnnee(annee, [s2, s1])).toEqual({ ok: true });
  });

  it('refuse une année qui finit avant de commencer ou sans période', () => {
    expect(verifierAnnee({ dateDebut: '2027-08-31', dateFin: '2026-09-01' }, [s1])).toEqual({
      ok: false,
      refus: 'dates-annee',
    });
    expect(verifierAnnee(annee, [])).toEqual({ ok: false, refus: 'aucune-periode' });
  });

  it('refuse une période inversée ou hors de l’année, avec son rang', () => {
    expect(verifierAnnee(annee, [s1, { dateDebut: '2027-03-01', dateFin: '2027-02-01' }])).toEqual({
      ok: false,
      refus: 'dates-periode',
      rang: 1,
    });
    expect(verifierAnnee(annee, [{ dateDebut: '2026-08-15', dateFin: '2027-01-31' }])).toEqual({
      ok: false,
      refus: 'periode-hors-annee',
      rang: 0,
    });
  });

  it('refuse deux périodes qui se chevauchent, même d’un jour', () => {
    expect(verifierAnnee(annee, [s2, { ...s1, dateFin: '2027-02-01' }])).toEqual({
      ok: false,
      refus: 'periodes-chevauchement',
      rang: 0,
    });
  });

  it('refuse de raccourcir l’année si une fermeture en sortirait', () => {
    const toussaint = { dateDebut: '2026-10-24', dateFin: '2026-11-01' };
    const ete = { dateDebut: '2027-07-15', dateFin: '2027-08-31' };
    expect(verifierAnnee(annee, [s1, s2], [toussaint, ete])).toEqual({ ok: true });
    expect(verifierAnnee({ ...annee, dateFin: '2027-07-31' }, [s1, s2], [toussaint, ete])).toEqual({
      ok: false,
      refus: 'fermeture-hors-annee',
      rang: 1,
    });
  });
});

describe('RG-01-04 fermetures et jours fériés', () => {
  it('accepte une fermeture d’un jour, refuse une fermeture inversée ou hors de l’année', () => {
    const pont = { dateDebut: '2027-05-07', dateFin: '2027-05-07' };
    expect(verifierFermeture(annee, pont)).toEqual({ ok: true });
    expect(verifierFermeture(annee, { dateDebut: '2027-05-08', dateFin: '2027-05-07' })).toEqual({
      ok: false,
      refus: 'dates-fermeture',
    });
    expect(verifierFermeture(annee, { dateDebut: '2027-08-30', dateFin: '2027-09-02' })).toEqual({
      ok: false,
      refus: 'fermeture-hors-annee',
    });
  });

  it('calcule les fériés de chaque année civile touchée, dans l’intervalle seulement', () => {
    const regles: RegleJourFerie[] = [
      { code: 'noel', libelle: 'Noël', type: 'fixe', mois: 12, jour: 25 },
      { code: 'lundi-de-paques', libelle: 'Lundi de Pâques', type: 'paques', decalage: 1 },
    ];
    const demandees: number[] = [];
    const feries = joursFeriesEntre(annee, (anneeCivile) => {
      demandees.push(anneeCivile);
      return regles;
    });
    expect(demandees).toEqual([2026, 2027]);
    // Pâques 2026 (6 avril) et Noël 2027 sont hors de l'année scolaire.
    expect(feries.map((f) => f.date)).toEqual(['2026-12-25', '2027-03-29']);
  });
});

describe('RG-00-05 statut de l’année', () => {
  it('fait avancer le statut sans retour, et fige une année clôturée', () => {
    expect(verifierModificationAnnee('preparation', 'en_cours')).toEqual({ ok: true });
    expect(verifierModificationAnnee('en_cours')).toEqual({ ok: true });
    expect(verifierModificationAnnee('en_cours', 'cloturee')).toEqual({ ok: true });
    expect(verifierModificationAnnee('en_cours', 'preparation')).toEqual({
      ok: false,
      refus: 'statut-retour',
    });
    expect(verifierModificationAnnee('cloturee', 'cloturee')).toEqual({
      ok: false,
      refus: 'annee-cloturee',
    });
  });

  it('ne supprime qu’une année en préparation', () => {
    expect(verifierSuppressionAnnee('preparation')).toEqual({ ok: true });
    expect(verifierSuppressionAnnee('en_cours')).toEqual({ ok: false, refus: 'annee-utilisee' });
  });
});
