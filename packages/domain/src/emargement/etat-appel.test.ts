import { describe, expect, it } from 'vitest';
import { minutesDeRetard, statutDansAppel } from './appel-manuel.js';
import {
  correctionVerrouillee,
  decisionAVerifier,
  etatAppel,
  listeCanonique,
  peutCorrigerVerrouille,
  raisonAVerifier,
  verifierModification,
  type LigneFeuille,
} from './etat-appel.js';

const MIN = 60_000;
const H = 60 * MIN;
const J = 24 * H;
const seance = { debutMs: 10 * J, finMs: 10 * J + 3 * H };

describe('etatAppel', () => {
  it('RG-06-01 l’appel est à venir, puis ouvert 10 minutes avant le début', () => {
    expect(etatAppel(seance, false, seance.debutMs - 11 * MIN)).toBe('a-venir');
    expect(etatAppel(seance, false, seance.debutMs - 10 * MIN)).toBe('ouvert');
    expect(etatAppel(seance, false, seance.finMs + J)).toBe('ouvert');
  });

  it('RG-06-01 l’appel validé est verrouillé 7 jours après la séance, validé ou non', () => {
    expect(etatAppel(seance, true, seance.debutMs)).toBe('valide');
    expect(etatAppel(seance, true, seance.finMs + 7 * J)).toBe('valide');
    expect(etatAppel(seance, true, seance.finMs + 7 * J + 1)).toBe('verrouille');
    expect(etatAppel(seance, false, seance.finMs + 7 * J + 1)).toBe('verrouille');
  });
});

describe('verifierModification', () => {
  const intervenant = { gestionnaire: false, motif: null };

  it('RG-06-12 avant validation, l’appel se modifie sans motif dès son ouverture', () => {
    expect(verifierModification(seance, false, seance.debutMs - 11 * MIN, intervenant)).toBe(
      'trop-tot',
    );
    expect(verifierModification(seance, false, seance.debutMs, intervenant)).toBeNull();
  });

  it('RG-06-15 après validation, une correction exige un motif', () => {
    expect(verifierModification(seance, true, seance.finMs, intervenant)).toBe('motif-requis');
    expect(
      verifierModification(seance, true, seance.finMs, { gestionnaire: false, motif: '  ' }),
    ).toBe('motif-requis');
    expect(
      verifierModification(seance, true, seance.finMs, { gestionnaire: false, motif: 'Oubli' }),
    ).toBeNull();
  });

  it('RG-06-15 l’intervenant corrige jusqu’à J+2, la scolarité jusqu’au verrouillage', () => {
    const motif = 'Arrivée signalée après coup';
    const apresJ2 = seance.finMs + 2 * J + 1;
    expect(
      verifierModification(seance, true, seance.finMs + 2 * J, { gestionnaire: false, motif }),
    ).toBeNull();
    expect(verifierModification(seance, true, apresJ2, { gestionnaire: false, motif })).toBe(
      'delai-intervenant',
    );
    expect(verifierModification(seance, true, apresJ2, { gestionnaire: true, motif })).toBeNull();
    expect(
      verifierModification(seance, true, seance.finMs + 7 * J + 1, { gestionnaire: true, motif }),
    ).toBe('verrouille');
  });

  it('RG-06-15 après verrouillage, le droit spécifique de l’école permet de corriger avec un motif', () => {
    const verrouille = { droit: 'ecole' as const };
    const tard = seance.finMs + 400 * J;
    expect(
      verifierModification(seance, true, tard, { gestionnaire: true, motif: 'Erreur', verrouille }),
    ).toBeNull();
    expect(
      verifierModification(seance, true, tard, { gestionnaire: true, motif: ' ', verrouille }),
    ).toBe('motif-requis');
    // Un appel jamais signé reste verrouillé, même avec le droit.
    expect(
      verifierModification(seance, false, tard, { gestionnaire: true, motif: 'x', verrouille }),
    ).toBe('verrouille');
    expect(correctionVerrouillee(seance, tard, verrouille)).toBe('ecole');
    expect(correctionVerrouillee(seance, seance.finMs + J, verrouille)).toBeNull();
  });

  it('RG-06-15 l’intervenant qui a le droit spécifique corrige jusqu’au délai de son école', () => {
    const verrouille = { droit: 'intervenant' as const, jours: 14 };
    const motif = 'Feuille papier retrouvée';
    const acteur = { gestionnaire: false, motif, verrouille };
    expect(verifierModification(seance, true, seance.finMs + 14 * J, acteur)).toBeNull();
    expect(verifierModification(seance, true, seance.finMs + 14 * J + 1, acteur)).toBe(
      'delai-verrouille',
    );
    expect(peutCorrigerVerrouille(seance, true, seance.finMs + 8 * J, verrouille)).toBe(true);
    expect(peutCorrigerVerrouille(seance, true, seance.finMs + 15 * J, verrouille)).toBe(false);
    // Avant le verrouillage, ce n'est pas une correction après verrouillage.
    expect(peutCorrigerVerrouille(seance, true, seance.finMs + J, verrouille)).toBe(false);
    // Délai réglé à 7 jours : rien n'est permis après le verrouillage.
    const sept = { droit: 'intervenant' as const, jours: 7 };
    expect(peutCorrigerVerrouille(seance, true, seance.finMs + 7 * J + 1, sept)).toBe(false);
  });

  it('RG-06-15 sans le droit spécifique, un appel verrouillé ne se corrige pas', () => {
    const tard = seance.finMs + 8 * J;
    expect(verifierModification(seance, true, tard, { gestionnaire: true, motif: 'x' })).toBe(
      'verrouille',
    );
    expect(peutCorrigerVerrouille(seance, true, tard, null)).toBe(false);
    expect(correctionVerrouillee(seance, tard, null)).toBeNull();
  });
});

describe('scans à vérifier et retards', () => {
  it('RG-06-11 la raison d’un scan à vérifier est gardée avec la décision de l’intervenant', () => {
    expect(raisonAVerifier({ rejoue: false, localisation: 'hors-site' })).toBe('hors-site');
    expect(raisonAVerifier({ rejoue: true, localisation: 'inconnu' })).toBe('inconnu');
    expect(raisonAVerifier({ rejoue: true, localisation: null })).toBe('rejoue');
    expect(raisonAVerifier({ rejoue: false, localisation: 'sur-place' })).toBeNull();
    expect(decisionAVerifier('hors-site', { statut: 'absent' })).toBe('retire');
    expect(decisionAVerifier('rejoue', { statut: 'retard' })).toBe('confirme');
    expect(decisionAVerifier('rejoue', null)).toBeNull();
    expect(decisionAVerifier(null, { statut: 'absent' })).toBeNull();
  });

  it('RG-06-02 un scan tardif est un retard, avec les minutes enregistrées au scan', () => {
    const scan = { rejoue: false, localisation: null, retardMinutes: 8 };
    expect(statutDansAppel(scan, null)).toBe('retard');
    expect(minutesDeRetard('retard', scan, null)).toBe(8);
    expect(minutesDeRetard('retard', scan, { statut: 'retard', minutesRetard: 20 })).toBe(20);
    expect(minutesDeRetard('present', scan, null)).toBeNull();
    expect(minutesDeRetard('retard', null, null)).toBeNull();
    expect(statutDansAppel({ ...scan, retardMinutes: 0 }, null)).toBe('present');
  });
});

describe('listeCanonique', () => {
  const ligne = (personneId: string, statut: LigneFeuille['statut']): LigneFeuille => ({
    personneId,
    statut,
    scanneLe: null,
    minutesRetard: null,
    aDistance: false,
    localisation: null,
    raison: null,
    decision: null,
    nonAttendu: false,
  });

  it('RG-06-13 l’empreinte ne dépend pas de l’ordre et change avec la liste ou la version', () => {
    const a = [ligne('b', 'present'), ligne('a', 'absent')];
    expect(listeCanonique('s', 1, a)).toBe(listeCanonique('s', 1, [...a].reverse()));
    expect(listeCanonique('s', 1, a)).not.toBe(listeCanonique('s', 2, a));
    // Une fiche en double garde son ordre (tri stable).
    expect(listeCanonique('s', 1, [...a, ligne('a', 'absent')])).toContain('"a","absent"');
    expect(listeCanonique('s', 1, a)).not.toBe(
      listeCanonique('s', 1, [ligne('b', 'present'), ligne('a', 'present')]),
    );
  });
});
