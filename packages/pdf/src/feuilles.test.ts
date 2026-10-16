import { describe, expect, it } from 'vitest';
import { loadTemplate, renderPdf } from './render.js';
import { texteDuPdf } from './texte.js';

// Données au format de packages/domain (donneesFeuilleSeance, recapitulatifMensuel), fictives.
const feuille = {
  organisme: { nom: 'École fictive', nda: '11755555555' },
  seance: {
    libelle: 'Réseaux',
    module: 'Réseaux (M12)',
    etablissement: 'Campus Lumière',
    formations: 'BTS SIO',
    publics: 'SIO 1 2026, TD A',
    date: '05/10/2026',
    horaires: '09:00 – 12:00',
    fuseau: 'Europe/Paris',
    lieu: 'B12, ou à distance',
    mode: 'Hybride (sur place ou à distance)',
    intervenants: 'Ada Martin, Léo Petit',
  },
  effectifs: { attendus: 2, presents: 1, retards: 0, absents: 1, nonAttendus: 1 },
  lignes: [
    {
      nom: 'BERNARD Alex',
      statut: 'Présent',
      pointage: 'QR code à 09:02 · à distance',
      signature: 'Signature électronique par scan authentifié et horodaté',
      controle: 'Vérifié',
      justification: '',
    },
    {
      nom: 'DURAND Bea',
      statut: 'Absent',
      pointage: '—',
      signature: '',
      controle: '—',
      justification: 'Justifiée',
    },
  ],
  signalements: ['IBERT Alex : non attendu, ajouté par l’intervenant.'],
  version: {
    numero: 2,
    derniere: false,
    valideLe: '14/10/2026 à 10:00',
    validePar: 'Léo Petit',
    empreinte: 'ab'.repeat(32),
  },
  historique: [
    { numero: 1, le: '05/10/2026 à 12:01', par: 'Ada Martin', nature: 'Validation', motif: '' },
    {
      numero: 2,
      le: '14/10/2026 à 10:00',
      par: 'Léo Petit',
      nature: 'Correction après verrouillage, par un intervenant',
      motif: 'Oubli',
    },
  ],
};
const emisLe = new Date('2026-10-15T08:00:00Z');
const sansEspace = (s: string) => s.replace(/\s+/g, '');

describe('Feuilles d’émargement PDF (RG-06-25, RG-06-26)', () => {
  it('RG-06-25 la feuille d’une séance porte en-tête, apprenants, signalements et validation', async () => {
    const rendu = renderPdf({
      template: await loadTemplate('feuille-seance'),
      donnees: {
        titre: 'Feuille d’émargement',
        organisme: 'École fictive',
        editeLe: '15/10/2026 à 10:00',
        feuilles: [feuille, { ...feuille, version: { ...feuille.version, derniere: true } }],
      },
      emisLe,
    });
    expect(rendu.pages).toBe(2);
    const texte = sansEspace(texteDuPdf(rendu.pdf));
    for (const attendu of [
      'École fictive · NDA 11755555555',
      'Version 2',
      'Version remplacée par une correction',
      'Campus Lumière',
      'SIO 1 2026, TD A',
      'Réseaux (M12)',
      '05/10/2026',
      '09:00 – 12:00',
      'B12, ou à distance',
      'Ada Martin, Léo Petit',
      'BERNARD Alex',
      'QR code à 09:02 · à distance',
      'Signature électronique par scan authentifié et horodaté',
      'DURAND Bea',
      'Justifiée',
      'non attendu, ajouté par l’intervenant',
      'validée par Léo Petit le 14/10/2026 à 10:00',
      'ab'.repeat(32),
      'Correction après verrouillage, par un intervenant',
      'Oubli',
    ])
      expect(texte).toContain(sansEspace(attendu));
  });

  it('RG-06-26 le récapitulatif mensuel liste les demi-journées et les totaux', async () => {
    const rendu = renderPdf({
      template: await loadTemplate('recapitulatif-mensuel'),
      donnees: {
        titre: 'Récapitulatif d’assiduité',
        organisme: { nom: 'École fictive', nda: null },
        promotion: 'SIO 1 2026',
        mois: 'octobre 2026',
        editeLe: '15/10/2026 à 10:00',
        apprenants: [
          {
            nom: 'ADAM Abel',
            lignes: [
              {
                date: '05/10/2026',
                demiJournee: 'Après-midi',
                seances: 'Système (14:00 – 17:00)',
                statut: 'Absent, justifié',
                prevues: '3 h 00',
                realisees: '0 min',
              },
            ],
            totaux: {
              demiJournees: 1,
              prevues: '3 h 00',
              realisees: '0 min',
              absencesJustifiees: 1,
              absencesNonJustifiees: 0,
              retards: 0,
              nonValidees: 0,
            },
          },
          {
            nom: 'ZOLA Zed',
            lignes: [],
            totaux: {
              demiJournees: 0,
              prevues: '0 min',
              realisees: '0 min',
              absencesJustifiees: 0,
              absencesNonJustifiees: 0,
              retards: 0,
              nonValidees: 0,
            },
          },
        ],
      },
      emisLe,
    });
    expect(rendu.pages).toBe(2);
    const texte = sansEspace(texteDuPdf(rendu.pdf));
    for (const attendu of [
      'Récapitulatif d’assiduité · octobre 2026',
      'ADAM Abel',
      'Promotion : SIO 1 2026',
      'Après-midi',
      'Système (14:00 – 17:00)',
      'Absent, justifié',
      'ZOLA Zed',
      'Aucune séance attendue ce mois-ci.',
    ])
      expect(texte).toContain(sansEspace(attendu));
    expect(texte).not.toContain('NDA');
  });
});
