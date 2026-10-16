import { describe, expect, it } from 'vitest';
import {
  dureeFr,
  donneesFeuilleSeance,
  MENTION_SIGNATURE_SCAN,
  moisEnClair,
  recapitulatifMensuel,
  type EnTeteSeance,
  type LigneFeuilleNommee,
  type SeanceRecapitulatif,
  type VersionFeuille,
} from './feuilles.js';

// 5 octobre 2026, heure d'été à Paris (UTC+2).
const entete: EnTeteSeance = {
  organisme: 'École fictive',
  nda: '11755555555',
  etablissement: 'Campus Lumière',
  formations: ['BTS SIO'],
  publics: ['SIO 1 2026', 'TD A'],
  libelle: 'Réseaux',
  module: 'Réseaux (M12)',
  debut: new Date('2026-10-05T07:00:00Z'),
  fin: new Date('2026-10-05T10:00:00Z'),
  fuseau: 'Europe/Paris',
  salle: 'B12',
  mode: 'presentiel',
  intervenants: ['Ada Martin', 'Léo Petit'],
};

const ligne = (p: Partial<LigneFeuilleNommee> & { nom: string }): LigneFeuilleNommee => ({
  personneId: p.nom,
  prenom: 'Alex',
  statut: 'present',
  scanneLe: null,
  minutesRetard: null,
  aDistance: false,
  localisation: null,
  raison: null,
  decision: null,
  nonAttendu: false,
  modeScan: null,
  decisionIntervenant: false,
  justification: null,
  ...p,
});

const v1: VersionFeuille = {
  version: 1,
  valideLe: new Date('2026-10-05T10:01:00Z'),
  validePar: 'Ada Martin',
  empreinte: 'a'.repeat(64),
  motif: null,
  correctionVerrouillee: null,
};
const versions: VersionFeuille[] = [
  v1,
  { ...v1, version: 2, motif: 'Erreur de saisie', empreinte: 'b'.repeat(64) },
  {
    ...v1,
    version: 3,
    valideLe: new Date('2026-10-14T08:00:00Z'),
    validePar: 'Léo Petit',
    motif: 'Oubli',
    correctionVerrouillee: 'intervenant',
  },
  { ...v1, version: 4, motif: 'Contrôle', correctionVerrouillee: 'ecole' },
];

const lignes: LigneFeuilleNommee[] = [
  ligne({ nom: 'Zola', scanneLe: '2026-10-05T07:02:00Z', modeScan: 'qr' }),
  ligne({
    nom: 'Bernard',
    statut: 'retard',
    minutesRetard: 12,
    scanneLe: '2026-10-05T07:12:00Z',
    modeScan: 'code',
    justification: 'justifiee',
  }),
  ligne({ nom: 'Durand', statut: 'absent' }),
  ligne({ nom: 'Durand', prenom: 'Bea', statut: 'en-attente', justification: 'non-justifiee' }),
  ligne({ nom: 'Morel', statut: 'present' }),
  ligne({
    nom: 'Faure',
    statut: 'a-verifier',
    scanneLe: '2026-10-05T07:01:00Z',
    raison: null,
    localisation: 'hors-site',
  }),
  ligne({
    nom: 'Garnier',
    scanneLe: '2026-10-05T07:03:00Z',
    raison: 'rejoue',
    decision: 'confirme',
    aDistance: true,
  }),
  ligne({
    nom: 'Henry',
    statut: 'absent',
    scanneLe: '2026-10-05T07:04:00Z',
    modeScan: 'manuel',
    raison: null,
    decision: 'retire',
    decisionIntervenant: true,
  }),
  ligne({ nom: 'Ibert', nonAttendu: true }),
  ligne({ nom: 'Jacob', statut: 'retard', minutesRetard: null }),
];

describe('Feuille d’émargement d’une séance (RG-06-25)', () => {
  const feuille = donneesFeuilleSeance(entete, lignes, versions, 3);
  const de = (nom: string) => feuille.lignes.filter((l) => l.nom.startsWith(nom.toUpperCase()));

  it('RG-06-25 en-tête : organisme, NDA, formation, module, date, horaires locaux, salle, intervenants', () => {
    expect(feuille.organisme).toEqual({ nom: 'École fictive', nda: '11755555555' });
    expect(feuille.seance).toMatchObject({
      date: '05/10/2026',
      horaires: '09:00 – 12:00',
      lieu: 'B12',
      mode: 'Présentiel',
      publics: 'SIO 1 2026, TD A',
      formations: 'BTS SIO',
      intervenants: 'Ada Martin, Léo Petit',
      module: 'Réseaux (M12)',
    });
  });

  it('RG-06-25 par apprenant : statut, heure du scan ou ajout manuel, contrôle, mention de signature', () => {
    expect(feuille.lignes.map((l) => l.nom)).toEqual([
      'BERNARD Alex',
      'DURAND Alex',
      'DURAND Bea',
      'FAURE Alex',
      'GARNIER Alex',
      'HENRY Alex',
      'IBERT Alex',
      'JACOB Alex',
      'MOREL Alex',
      'ZOLA Alex',
    ]);
    expect(de('Zola')[0]).toEqual({
      nom: 'ZOLA Alex',
      statut: 'Présent',
      pointage: 'QR code à 09:02',
      signature: MENTION_SIGNATURE_SCAN,
      controle: 'Vérifié',
      justification: '',
    });
    expect(de('Bernard')[0]).toMatchObject({
      statut: 'Retard (12 min)',
      pointage: 'Code à 6 chiffres à 09:12',
      justification: 'Justifiée',
    });
    expect(de('Durand').map((l) => [l.statut, l.pointage, l.signature, l.justification])).toEqual([
      ['Absent', '—', '', 'Non justifiée'],
      ['Absent (non pointé)', '—', '', 'Non justifiée'],
    ]);
    expect(de('Morel')[0]).toMatchObject({ pointage: 'Marqué par l’intervenant', controle: '—' });
    expect(de('Faure')[0]).toMatchObject({
      statut: 'Présent (à vérifier)',
      controle: 'À vérifier : sans décision',
    });
    expect(de('Garnier')[0]).toMatchObject({
      pointage: 'QR code à 09:03 · à distance',
      controle: 'À vérifier (scan hors ligne) : confirmé par l’intervenant',
    });
    expect(de('Henry')[0]).toMatchObject({
      pointage: 'Saisie manuelle à 09:04 · statut fixé par l’intervenant',
      signature: '',
      controle: 'À vérifier : retiré par l’intervenant',
    });
    expect(de('Ibert')[0]).toMatchObject({
      pointage: 'Non attendu, ajouté par l’intervenant',
      justification: '',
    });
    expect(de('Jacob')[0]).toMatchObject({
      statut: 'Retard (0 min)',
      justification: 'Non justifiée',
    });
  });

  it('RGPD-03 : ni la raison précise du contrôle de localisation ni la position', () => {
    const texte = JSON.stringify(feuille);
    expect(texte).not.toMatch(/hors-site|hors site|inconnu/i);
  });

  it('RG-06-11 signalements : scans à vérifier, non attendus, corrections d’un intervenant après verrouillage', () => {
    expect(feuille.signalements).toEqual([
      'FAURE Alex : à vérifier : sans décision.',
      'GARNIER Alex : à vérifier (scan hors ligne) : confirmé par l’intervenant.',
      'HENRY Alex : à vérifier : retiré par l’intervenant.',
      'IBERT Alex : non attendu, ajouté par l’intervenant.',
      'Version 3 : correction après verrouillage par un intervenant (Léo Petit, le 14/10/2026 à 10:00).',
    ]);
    expect(feuille.effectifs).toEqual({
      attendus: 9,
      presents: 6,
      retards: 2,
      absents: 3,
      nonAttendus: 1,
    });
  });

  it('RG-06-13 pied : version signée, horodatage serveur, auteur, empreinte et historique', () => {
    expect(feuille.version).toEqual({
      numero: 3,
      derniere: false,
      valideLe: '14/10/2026 à 10:00',
      validePar: 'Léo Petit',
      empreinte: 'a'.repeat(64),
    });
    expect(feuille.historique.map((h) => [h.numero, h.nature, h.motif])).toEqual([
      [1, 'Validation', ''],
      [2, 'Correction', 'Erreur de saisie'],
      [3, 'Correction après verrouillage, par un intervenant', 'Oubli'],
    ]);
    const derniere = donneesFeuilleSeance(entete, [], versions, 4);
    expect(derniere.version.derniere).toBe(true);
    expect(derniere.historique.at(-1)?.nature).toBe('Correction après verrouillage, par l’école');
    expect(() => donneesFeuilleSeance(entete, [], versions, 9)).toThrow(RangeError);
  });

  it('RG-06-08 lieu : à distance, hybride, salle absente, champs vides', () => {
    const vide = { ...entete, module: null, etablissement: null, formations: [], publics: [] };
    const distance = donneesFeuilleSeance(
      { ...vide, mode: 'distanciel', intervenants: [] },
      [],
      [v1],
      1,
    );
    expect(distance.seance).toMatchObject({
      lieu: 'À distance',
      mode: 'À distance',
      module: '—',
      etablissement: '—',
      formations: '—',
      publics: '—',
      intervenants: '—',
    });
    expect(donneesFeuilleSeance({ ...entete, mode: 'hybride' }, [], [v1], 1).seance.lieu).toBe(
      'B12, ou à distance',
    );
    expect(donneesFeuilleSeance({ ...entete, salle: null }, [], [v1], 1).seance.lieu).toBe(
      'Salle non renseignée',
    );
  });
});

describe('Récapitulatif mensuel par apprenant (RG-06-26)', () => {
  const seance = (id: string, debut: string, fin: string, validee = true): SeanceRecapitulatif => ({
    id,
    libelle: id,
    debut: new Date(debut),
    fin: new Date(fin),
    fuseau: 'Europe/Paris',
    limiteMidi: '13:00',
    validee,
  });
  const seances = [
    // Lundi 5 : 9 h - 12 h et 14 h - 17 h ; mardi 6 : 9 h - 17 h ; mercredi 7 : 9 h - 12 h non validé.
    seance('Réseaux', '2026-10-05T07:00:00Z', '2026-10-05T10:00:00Z'),
    seance('Système', '2026-10-05T12:00:00Z', '2026-10-05T15:00:00Z'),
    seance('Projet', '2026-10-06T07:00:00Z', '2026-10-06T15:00:00Z'),
    seance('Anglais', '2026-10-07T07:00:00Z', '2026-10-07T10:00:00Z', false),
    seance('Maths', '2026-10-08T07:00:00Z', '2026-10-08T09:00:00Z'),
    seance('Droit', '2026-10-08T09:00:00Z', '2026-10-08T10:00:00Z'),
  ];
  const tous = (personneId: string) =>
    [...seances.map((s) => s.id), 'inconnue'].map((seanceId) => ({ seanceId, personneId }));
  const [adam, sansSeance, zoe] = recapitulatifMensuel({
    apprenants: [
      { personneId: 'z', nom: 'Zoé', prenom: 'Zed' },
      { personneId: 'a', nom: 'Adam', prenom: 'Abel' },
      { personneId: 'b', nom: 'Adam', prenom: 'Zack' },
    ],
    seances,
    attendus: [...tous('a'), { seanceId: 'Réseaux', personneId: 'z' }],
    absences: [
      {
        seanceId: 'Réseaux',
        personneId: 'a',
        nature: 'retard',
        minutes: 15,
        statut: 'non-justifiee',
      },
      {
        seanceId: 'Système',
        personneId: 'a',
        nature: 'absence',
        minutes: 180,
        statut: 'justifiee',
      },
      {
        seanceId: 'Projet',
        personneId: 'a',
        nature: 'absence',
        minutes: 480,
        statut: 'non-justifiee',
      },
      {
        seanceId: 'Maths',
        personneId: 'a',
        nature: 'retard',
        minutes: 150,
        statut: 'non-justifiee',
      },
    ],
  });

  it('RG-06-26 liste chaque demi-journée : date, matin ou après-midi, séances, statut, heures', () => {
    expect(adam?.nom).toBe('ADAM Abel');
    expect(adam?.lignes).toEqual([
      {
        date: '05/10/2026',
        demiJournee: 'Matin',
        seances: 'Réseaux (09:00 – 12:00)',
        statut: 'Retard',
        prevues: '3 h 00',
        realisees: '2 h 45',
      },
      {
        date: '05/10/2026',
        demiJournee: 'Après-midi',
        seances: 'Système (14:00 – 17:00)',
        statut: 'Absent, justifié',
        prevues: '3 h 00',
        realisees: '0 min',
      },
      {
        date: '06/10/2026',
        demiJournee: 'Matin',
        seances: 'Projet (09:00 – 13:00)',
        statut: 'Absent, non justifié',
        prevues: '4 h 00',
        realisees: '0 min',
      },
      {
        date: '06/10/2026',
        demiJournee: 'Après-midi',
        seances: 'Projet (13:00 – 17:00)',
        statut: 'Absent, non justifié',
        prevues: '4 h 00',
        realisees: '0 min',
      },
      {
        date: '07/10/2026',
        demiJournee: 'Matin',
        seances: 'Anglais (09:00 – 12:00)',
        statut: 'Appel non validé',
        prevues: '3 h 00',
        realisees: '—',
      },
      {
        date: '08/10/2026',
        demiJournee: 'Matin',
        seances: 'Maths (09:00 – 11:00) ; Droit (11:00 – 12:00)',
        statut: 'Retard',
        prevues: '3 h 00',
        realisees: '1 h 00',
      },
    ]);
  });

  it('RG-06-26 totaux : heures prévues et réalisées, demi-journées justifiées ou non', () => {
    expect(adam?.totaux).toEqual({
      demiJournees: 6,
      prevues: '20 h 00',
      realisees: '3 h 45',
      absencesJustifiees: 1,
      absencesNonJustifiees: 2,
      retards: 2,
      nonValidees: 1,
    });
    expect(zoe?.lignes.map((l) => l.statut)).toEqual(['Présent']);
    expect(sansSeance?.lignes).toEqual([]);
  });

  it('met en forme durées et mois', () => {
    expect(dureeFr(45)).toBe('45 min');
    expect(dureeFr(125)).toBe('2 h 05');
    expect(moisEnClair('2026-10')).toBe('octobre 2026');
  });
});
