import { describe, expect, it } from 'vitest';
import {
  ajouterMois,
  bloquant,
  contratActif,
  controlerStage,
  statutDuContrat,
  transitionConventionPermise,
  transitionPermise,
  verifierContrat,
  verifierRupture,
} from './contrats.js';

const regles = { seuilGratificationHeures: 308, dureeMaximaleMois: 6, heuresParMois: 154 };

describe('RG-03-05 statuts d’un contrat', () => {
  it('suit brouillon → signé → en cours → terminé ou rompu', () => {
    expect(transitionPermise('brouillon', 'signe')).toBe(true);
    expect(transitionPermise('signe', 'en_cours')).toBe(true);
    expect(transitionPermise('signe', 'rompu')).toBe(true);
    expect(transitionPermise('en_cours', 'termine')).toBe(true);
    expect(transitionPermise('en_cours', 'en_cours')).toBe(true);
    expect(transitionPermise('brouillon', 'en_cours')).toBe(false);
    expect(transitionPermise('rompu', 'en_cours')).toBe(false);
    expect(transitionPermise('termine', 'rompu')).toBe(false);
    expect(contratActif('signe')).toBe(true);
    expect(contratActif('brouillon')).toBe(false);
  });
  it('suit les statuts d’une convention : annulée avant la fin', () => {
    expect(transitionConventionPermise('brouillon', 'signee')).toBe(true);
    expect(transitionConventionPermise('en_cours', 'annulee')).toBe(true);
    expect(transitionConventionPermise('signee', 'signee')).toBe(true);
    expect(transitionConventionPermise('terminee', 'annulee')).toBe(false);
    expect(transitionConventionPermise('brouillon', 'terminee')).toBe(false);
  });
  it('RG-03-06 donne le statut de l’apprenant', () => {
    expect(statutDuContrat('apprentissage')).toBe('apprenti');
    expect(statutDuContrat('professionnalisation')).toBe('professionnalisation');
    expect(statutDuContrat('autre')).toBeNull();
  });
});

describe('RG-03-09 contrats successifs, jamais deux en même temps', () => {
  const base = {
    debut: '2026-09-01',
    fin: '2028-08-31',
    tuteurs: 1,
    statut: 'signe',
    autres: [],
  } as const;
  it('accepte un contrat après un autre, ou un brouillon qui chevauche', () => {
    expect(verifierContrat(base)).toEqual({ ok: true });
    expect(
      verifierContrat({
        ...base,
        autres: [{ debut: '2025-09-01', fin: '2026-08-31', statut: 'termine' }],
      }),
    ).toEqual({ ok: true });
    expect(
      verifierContrat({
        ...base,
        statut: 'brouillon',
        autres: [{ debut: '2026-01-01', fin: '2027-01-01', statut: 'en_cours' }],
      }),
    ).toEqual({ ok: true });
    expect(
      verifierContrat({
        ...base,
        autres: [{ debut: '2026-01-01', fin: '2027-01-01', statut: 'rompu' }],
      }),
    ).toEqual({ ok: true });
  });
  it('refuse des dates inversées, zéro ou trois tuteurs, un chevauchement de contrats actifs', () => {
    expect(verifierContrat({ ...base, fin: '2026-08-31' })).toEqual({ ok: false, refus: 'dates' });
    expect(verifierContrat({ ...base, tuteurs: 0 })).toEqual({ ok: false, refus: 'tuteurs' });
    expect(verifierContrat({ ...base, tuteurs: 3 })).toEqual({ ok: false, refus: 'tuteurs' });
    expect(
      verifierContrat({
        ...base,
        autres: [{ debut: '2026-01-01', fin: '2026-09-01', statut: 'en_cours' }],
      }),
    ).toEqual({ ok: false, refus: 'chevauchement' });
  });
});

describe('RG-03-07 rupture', () => {
  const base = {
    debut: '2026-09-01',
    fin: '2028-08-31',
    date: '2027-03-31',
    type: 'apprentissage',
    poursuiteSansEmployeur: true,
    moisSansEmployeur: 6,
  } as const;
  it('calcule la fin de la période sans employeur', () => {
    expect(verifierRupture(base)).toEqual({ ok: true, finSansEmployeur: '2027-09-30' });
    expect(verifierRupture({ ...base, poursuiteSansEmployeur: false })).toEqual({
      ok: true,
      finSansEmployeur: null,
    });
  });
  it('refuse une date hors du contrat, et la poursuite sans employeur hors apprentissage', () => {
    expect(verifierRupture({ ...base, date: '2026-08-31' })).toEqual({
      ok: false,
      refus: 'date-rupture',
    });
    expect(verifierRupture({ ...base, date: '2028-09-01' })).toEqual({
      ok: false,
      refus: 'date-rupture',
    });
    expect(verifierRupture({ ...base, type: 'professionnalisation' })).toEqual({
      ok: false,
      refus: 'sans-employeur',
    });
  });
  it('ajoute des mois en restant dans le mois (31 août + 6 mois = 28 février)', () => {
    expect(ajouterMois('2026-08-31', 6)).toBe('2027-02-28');
    expect(ajouterMois('2026-01-15', 1)).toBe('2026-02-15');
  });
});

describe('RG-03-23 contrôles d’une convention de stage', () => {
  const base = {
    heuresPresence: 280,
    gratificationHoraire: null,
    heuresAutresStagesAnnee: 0,
    heuresAutresStagesOrganisme: 0,
    regles,
    gratificationMinimale: 450,
  };
  it('aucun contrôle sous 308 heures', () => {
    expect(controlerStage(base)).toEqual([]);
  });
  it('critère d’acceptation : 400 heures sans gratification sont signalées et bloquent', () => {
    const controles = controlerStage({ ...base, heuresPresence: 400 });
    expect(controles).toEqual([{ type: 'gratification-obligatoire', heures: 400, seuil: 308 }]);
    expect(controles.some(bloquant)).toBe(true);
  });
  it('compte les autres stages de l’année et contrôle le montant minimal', () => {
    expect(controlerStage({ ...base, heuresAutresStagesAnnee: 100 })).toEqual([
      { type: 'gratification-obligatoire', heures: 380, seuil: 308 },
    ]);
    const insuffisante = controlerStage({
      ...base,
      heuresPresence: 400,
      gratificationHoraire: 300,
    });
    expect(insuffisante).toEqual([
      { type: 'gratification-insuffisante', montant: 300, minimum: 450 },
    ]);
    expect(insuffisante.some(bloquant)).toBe(false);
    expect(controlerStage({ ...base, heuresPresence: 400, gratificationHoraire: 450 })).toEqual([]);
  });
  it('critère d’acceptation : 7 mois dans le même organisme sont signalés', () => {
    expect(controlerStage({ ...base, heuresPresence: 7 * 154, gratificationHoraire: 450 })).toEqual(
      [{ type: 'duree-maximale', heures: 1078, maximum: 924 }],
    );
    expect(
      controlerStage({
        ...base,
        heuresPresence: 500,
        gratificationHoraire: 450,
        heuresAutresStagesOrganisme: 500,
      }),
    ).toEqual([{ type: 'duree-maximale', heures: 1000, maximum: 924 }]);
  });
});
