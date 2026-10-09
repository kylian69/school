import { describe, expect, it } from 'vitest';
import {
  COLONNES_EDT,
  decouper,
  deciderReimport,
  empreinteSeance,
  IMPORT_EDT_SEANCES_MAX,
  lireHeure,
  lireIcal,
  lireImportEdt,
  lireTypeSeance,
  rapprocher,
  refusAnnulationDisparue,
} from './import.js';

const PARIS = 'Europe/Paris';
const tableau = (lignes: string[][], colonnes: string[] = [...COLONNES_EDT]) => ({
  colonnes,
  lignes,
});
const ligneModele = [
  '12/10/2026',
  '08:30',
  '10:30',
  'M101',
  'Groupe A, Groupe B',
  'alice@exemple.test',
  'Salle 1',
  'TD',
  'HP-1',
];

describe('RG-04-08 lecture d’un tableur d’emploi du temps', () => {
  it('RG-04-08 lit une ligne du modèle dans le fuseau de l’établissement', () => {
    const lu = lireImportEdt(tableau([ligneModele]), PARIS);
    expect(lu.erreurs).toEqual([]);
    expect(lu.seances).toEqual([
      {
        ligne: 2,
        identifiant: 'HP-1',
        debut: new Date('2026-10-12T06:30:00Z'),
        fin: new Date('2026-10-12T08:30:00Z'),
        module: 'M101',
        publics: ['Groupe A', 'Groupe B'],
        intervenants: ['alice@exemple.test'],
        salle: 'Salle 1',
        type: 'td',
      },
    ]);
  });

  it('RG-04-08 reconnaît un export Hyperplanning (heure et durée, matière, enseignant)', () => {
    const lu = lireImportEdt(
      tableau(
        [['2026-12-01', '14h', '1h30', 'Droit', 'DUPONT Jean', 'BTS 1', '']],
        ['Date', 'Heure', 'Durée', 'Matière', 'Enseignant', 'Promotion', 'Salle'],
      ),
      PARIS,
    );
    expect(lu.erreurs).toEqual([]);
    expect(lu.seances[0]).toMatchObject({
      debut: new Date('2026-12-01T13:00:00Z'),
      fin: new Date('2026-12-01T14:30:00Z'),
      salle: null,
      type: 'cm',
      intervenants: ['DUPONT Jean'],
    });
  });

  it('RG-04-08 lit une date Excel portant l’heure', () => {
    const lu = lireImportEdt(
      tableau(
        [['2026-10-12T09:00', '', '90 min', 'M1', 'G']],
        ['Date', 'Début', 'Durée', 'Module', 'Groupe'],
      ),
      PARIS,
    );
    expect(lu.seances[0]?.debut).toEqual(new Date('2026-10-12T07:00:00Z'));
    expect(lu.seances[0]?.fin).toEqual(new Date('2026-10-12T08:30:00Z'));
  });

  it('RG-04-11 calcule un identifiant stable sans colonne dédiée', () => {
    const colonnes = COLONNES_EDT.slice(0, 8);
    const une = lireImportEdt(tableau([ligneModele.slice(0, 8)], [...colonnes]), PARIS);
    const deux = lireImportEdt(
      tableau(
        [[...ligneModele.slice(0, 4), 'groupe b; GROUPE A', ...ligneModele.slice(5, 8)]],
        [...colonnes],
      ),
      PARIS,
    );
    expect(une.seances[0]?.identifiant).toMatch(/^auto:/);
    expect(deux.seances[0]?.identifiant).toBe(une.seances[0]?.identifiant);
  });

  it('RG-01-18 signale les colonnes absentes', () => {
    const lu = lireImportEdt(tableau([], ['Date', 'Module']), PARIS);
    expect(lu.erreurs).toEqual([
      {
        ligne: 1,
        message: 'Colonnes absentes : Début, Groupes, Fin. Reprenez le modèle à télécharger.',
      },
    ]);
  });

  it.each([
    [['32/13/2026', '08:00', '10:00', 'M', 'G'], 'Date illisible'],
    [['12/10/2026', 'matin', '10:00', 'M', 'G'], 'Heure de début illisible'],
    [['12/10/2026', '08:00', 'midi', 'M', 'G'], 'Heure de fin ou durée illisible'],
    [['12/10/2026', '10:00', '08:00', 'M', 'G'], 'L’heure de fin doit suivre'],
    [['12/10/2026', '08:00', '10:00', '', 'G'], 'Indiquez le module'],
    [['12/10/2026', '08:00', '10:00', 'M', 'G', '', '', 'Sieste'], 'Type inconnu'],
  ])('RG-01-18 explique l’erreur de la ligne %j', (cellules, message) => {
    const lu = lireImportEdt(tableau([cellules]), PARIS);
    expect(lu.seances).toEqual([]);
    expect(lu.erreurs[0]?.ligne).toBe(2);
    expect(lu.erreurs[0]?.message).toContain(message);
  });

  it('RG-01-18 signale une seule colonne absente', () => {
    const lu = lireImportEdt(tableau([], ['Date', 'Début', 'Fin', 'Module']), PARIS);
    expect(lu.erreurs[0]?.message).toBe(
      'Colonne absente : Groupes. Reprenez le modèle à télécharger.',
    );
  });

  it('RG-04-08 accepte une ligne plus courte que l’en-tête (salle absente)', () => {
    const lu = lireImportEdt(tableau([['12/10/2026', '08:00', '10:00', 'M', 'G']]), PARIS);
    expect(lu.erreurs).toEqual([]);
    expect(lu.seances[0]).toMatchObject({ salle: null, intervenants: [], type: 'cm' });
  });

  it.each([
    [['12/10/2026', '', 'abc', 'M', 'G'], 'Heure de début illisible : «  »'],
    [['12/10/2026', '08:00', 'abc', 'M', 'G'], 'Heure de fin ou durée illisible : « abc »'],
  ])('RG-01-18 explique une durée illisible (%j)', (cellules, message) => {
    const lu = lireImportEdt(
      tableau([cellules], ['Date', 'Début', 'Durée', 'Module', 'Groupe']),
      PARIS,
    );
    expect(lu.erreurs[0]?.message).toBe(`${message}.`);
  });

  it('RG-04-11 refuse un identifiant en double dans le fichier', () => {
    const lu = lireImportEdt(tableau([ligneModele, ligneModele]), PARIS);
    expect(lu.seances).toHaveLength(1);
    expect(lu.erreurs).toEqual([
      { ligne: 3, message: 'Cette séance figure déjà ligne 2 (même identifiant).' },
    ]);
  });

  it('RG-01-17 limite le nombre de séances par fichier', () => {
    const lignes = Array.from({ length: IMPORT_EDT_SEANCES_MAX + 1 }, (_, i) => [
      ...ligneModele.slice(0, 8),
      `id-${String(i)}`,
    ]);
    const lu = lireImportEdt(tableau(lignes), PARIS);
    expect(lu.seances).toEqual([]);
    expect(lu.erreurs).toEqual([
      { ligne: null, message: expect.stringContaining('5000 au plus') as string },
    ]);
  });
});

describe('RG-04-08 lecture des valeurs', () => {
  it.each([
    ['8:30', 510],
    ['08h30', 510],
    ['8h', 480],
    ['08:30:00', 510],
    ['0,375', 540],
    ['0,99999', null],
    ['25:00', null],
    ['', null],
  ])('lit l’heure %j', (saisie, minutes) => {
    expect(lireHeure(saisie)).toBe(minutes);
  });

  it.each([
    ['', 'cm'],
    ['Cours magistral', 'cm'],
    ['Travaux dirigés', 'td'],
    ['TP', 'tp'],
    ['Projet', 'projet'],
    ['Partiel', 'examen'],
    ['Sieste', null],
  ])('lit le type %j', (saisie, type) => {
    expect(lireTypeSeance(saisie)).toBe(type);
  });

  it('découpe une liste sans doublon', () => {
    expect(decouper('A, B;A | C\nD')).toEqual(['A', 'B', 'C', 'D']);
  });

  it.each([
    ['2 h', 'durée en heures'],
    ['1,5', 'durée décimale'],
  ])('lit la durée %j (%s)', (duree) => {
    const lu = lireImportEdt(
      tableau(
        [['12/10/2026', '08:00', duree, 'M', 'G']],
        ['Date', 'Début', 'Durée', 'Module', 'Groupe'],
      ),
      PARIS,
    );
    expect(lu.erreurs).toEqual([]);
  });
});

const ics = (...evenements: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...evenements, 'END:VCALENDAR'].join('\r\n');
const evenement = (...lignes: string[]) => ['BEGIN:VEVENT', ...lignes, 'END:VEVENT'].join('\r\n');

describe('RG-04-09 lecture d’un fichier iCal', () => {
  it('RG-04-09 lit titre, lieu et description (groupes, intervenants, type)', () => {
    const lu = lireIcal(
      ics(
        evenement(
          'UID:abc@google.com',
          'DTSTART;TZID=Europe/Paris:20261012T083000',
          'DTEND;TZID=Europe/Paris:20261012T103000',
          'SUMMARY:Droit des affaires',
          'LOCATION:Salle 1\\, bâtiment A',
          'DESCRIPTION:Groupes : BTS 1\\, Groupe A\\nIntervenant : alice@exemple.te',
          ' st\\nType : TD',
        ),
      ),
      PARIS,
    );
    expect(lu.erreurs).toEqual([]);
    expect(lu.seances).toEqual([
      {
        ligne: 1,
        identifiant: 'abc@google.com',
        debut: new Date('2026-10-12T06:30:00Z'),
        fin: new Date('2026-10-12T08:30:00Z'),
        module: 'Droit des affaires',
        publics: ['BTS 1', 'Groupe A'],
        intervenants: ['alice@exemple.test'],
        salle: 'Salle 1, bâtiment A',
        type: 'td',
      },
    ]);
  });

  it('RG-04-09 lit une heure UTC, une heure flottante et une durée', () => {
    const lu = lireIcal(
      ics(
        '',
        evenement('UID:1', 'DTSTART:20261012T080000Z', 'DURATION:PT1H30M', 'SUMMARY:M'),
        evenement('UID:2', 'DTSTART:20261012T080000', 'DTEND:20261012T090000', 'SUMMARY:M'),
      ),
      PARIS,
    );
    expect(lu.seances.map((s) => [s.debut.toISOString(), s.fin.toISOString()])).toEqual([
      ['2026-10-12T08:00:00.000Z', '2026-10-12T09:30:00.000Z'],
      ['2026-10-12T06:00:00.000Z', '2026-10-12T07:00:00.000Z'],
    ]);
  });

  it('RG-04-09 déroule une répétition hebdomadaire, exclusions et exceptions comprises', () => {
    const lu = lireIcal(
      ics(
        evenement(
          'UID:serie',
          'DTSTART;TZID=Europe/Paris:20261019T090000',
          'DTEND;TZID=Europe/Paris:20261019T110000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
          'EXDATE;TZID=Europe/Paris:20261021T090000',
          'SUMMARY:M',
        ),
        evenement(
          'UID:serie',
          'RECURRENCE-ID;TZID=Europe/Paris:20261026T090000',
          'DTSTART;TZID=Europe/Paris:20261026T140000',
          'DTEND;TZID=Europe/Paris:20261026T160000',
          'SUMMARY:M',
        ),
      ),
      PARIS,
    );
    expect(lu.erreurs).toEqual([]);
    expect(lu.seances.map((s) => [s.identifiant, s.debut.toISOString()])).toEqual([
      ['serie/2026-10-26T09:00', '2026-10-26T13:00:00.000Z'],
      ['serie/2026-10-19T09:00', '2026-10-19T07:00:00.000Z'],
      ['serie/2026-10-28T09:00', '2026-10-28T08:00:00.000Z'],
      ['serie/2026-11-02T09:00', '2026-11-02T08:00:00.000Z'],
    ]);
  });

  it('RG-04-09 déroule une répétition quotidienne jusqu’à une date', () => {
    const lu = lireIcal(
      ics(
        evenement(
          'UID:q',
          'DTSTART:20261012T080000Z',
          'DTEND:20261012T090000Z',
          'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261016T235959Z',
          'SUMMARY:M',
        ),
      ),
      PARIS,
    );
    expect(lu.seances.map((s) => s.identifiant)).toEqual([
      'q/2026-10-12T08:00',
      'q/2026-10-14T08:00',
      'q/2026-10-16T08:00',
    ]);
  });

  it('RG-04-09 ne retient pas les jours d’une semaine antérieurs au premier cours', () => {
    const lu = lireIcal(
      ics(
        evenement(
          'UID:me',
          'DTSTART:20261014T080000',
          'DTEND:20261014T090000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3',
          'SUMMARY:M',
        ),
      ),
      PARIS,
    );
    expect(lu.seances.map((s) => s.identifiant)).toEqual([
      'me/2026-10-14T08:00',
      'me/2026-10-19T08:00',
      'me/2026-10-21T08:00',
    ]);
  });

  it.each([
    ['RRULE:COUNT=3', 'répétition non prise en charge'],
    ['RRULE:FREQ=WEEKLY;BYDAY=XX;COUNT=2', 'répétition non prise en charge'],
    ['RRULE:FREQ=MONTHLY;COUNT=3', 'répétition non prise en charge'],
    ['RRULE:FREQ=WEEKLY', 'répétition non prise en charge'],
  ])('RG-04-09 refuse une répétition %j', (regle, message) => {
    const lu = lireIcal(
      ics(
        evenement(
          'UID:r',
          'DTSTART:20261012T080000Z',
          'DTEND:20261012T090000Z',
          regle,
          'SUMMARY:M',
        ),
      ),
      PARIS,
    );
    expect(lu.erreurs[0]?.message).toContain(message);
  });

  it('RG-04-09 ignore et signale les journées entières et les événements annulés', () => {
    const lu = lireIcal(
      ics(
        evenement('UID:f', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:Toussaint'),
        evenement(
          'UID:x',
          'DTSTART:20261012T080000Z',
          'DTEND:20261012T090000Z',
          'STATUS:CANCELLED',
          'SUMMARY:M',
        ),
      ),
      PARIS,
    );
    expect(lu.seances).toEqual([]);
    expect(lu.avertissements.map((a) => a.message)).toEqual([
      'Toussaint : événement sur la journée entière, ignoré.',
      'M : événement annulé, ignoré.',
    ]);
  });

  it.each([
    [['DTSTART:20261012T080000Z', 'DTEND:20261012T090000Z', 'SUMMARY:M'], 'sans UID'],
    [['UID:1', 'DTSTART:demain', 'SUMMARY:M'], 'date de début illisible'],
    [['UID:1', 'SUMMARY:M'], 'date de début illisible'],
    [['UID:1', 'DTSTART:20261012T080000Z', 'DURATION:bientôt', 'SUMMARY:M'], 'fin absente'],
    [
      ['UID:1', 'DTSTART:20261012T080000Z', 'DTEND;TZID=Mars/Olympe:20261012T090000', 'SUMMARY:M'],
      'fin absente',
    ],
    [['UID:1', 'DTSTART;TZID=Mars/Olympe:20261012T080000', 'SUMMARY:M'], 'fuseau horaire inconnu'],
    [['UID:1', 'DTSTART:20261012T080000Z', 'SUMMARY:M'], 'fin absente'],
    [['UID:1', 'DTSTART:20261012T080000Z', 'DTEND:20261012T090000Z'], 'titre absent'],
    [
      [
        'UID:1',
        'DTSTART:20261012T080000Z',
        'DTEND:20261012T090000Z',
        'SUMMARY:M',
        'DESCRIPTION:Type : sieste',
      ],
      'type inconnu',
    ],
  ])('RG-04-09 explique l’erreur d’un événement %#', (lignes, message) => {
    const lu = lireIcal(ics(evenement(...lignes)), PARIS);
    expect(lu.seances).toEqual([]);
    expect(lu.erreurs[0]?.message).toContain(message);
  });

  it('RG-01-17 limite le nombre d’occurrences d’un fichier iCal', () => {
    const lu = lireIcal(
      ics(
        ...Array.from({ length: 14 }, (_, i) =>
          evenement(
            `UID:r${String(i)}`,
            'DTSTART:20261012T080000Z',
            'DTEND:20261012T090000Z',
            'RRULE:FREQ=DAILY;COUNT=366',
            'SUMMARY:M',
          ),
        ),
      ),
      PARIS,
    );
    expect(lu.seances).toEqual([]);
    expect(lu.erreurs).toEqual([
      { ligne: null, message: expect.stringContaining('5124 séances') as string },
    ]);
  });

  it('RG-04-09 signale un fichier sans événement', () => {
    expect(lireIcal('bonjour', PARIS).erreurs[0]?.message).toContain('Aucun événement');
  });
});

describe('RG-04-09 rapprochement des libellés', () => {
  const candidats = [
    { id: 'm1', libelles: ['M101', 'Droit des affaires'] },
    { id: 'm2', libelles: ['M102', 'Économie'] },
    { id: 'm3', libelles: ['M103', 'economie'] },
  ];
  it('rapproche sans accents ni casse', () => {
    expect(rapprocher('droit DES affaires', candidats)).toBe('m1');
    expect(rapprocher('m102', candidats)).toBe('m2');
  });
  it('ne rapproche pas un libellé ambigu ou inconnu', () => {
    expect(rapprocher('Économie', candidats)).toBeNull();
    expect(rapprocher('Chimie', candidats)).toBeNull();
  });
});

describe('RG-04-11 et RG-04-12 réimport', () => {
  const contenu = {
    debut: new Date('2026-10-12T08:00:00Z'),
    fin: new Date('2026-10-12T10:00:00Z'),
    type: 'td',
    moduleId: 'm',
    activite: null,
    promotionIds: ['p2', 'p1'],
    groupeIds: [],
    salleId: null,
    intervenantIds: ['i'],
  };
  const fichier = empreinteSeance(contenu);
  const autre = empreinteSeance({ ...contenu, salleId: 's' });

  it('l’empreinte ne dépend pas de l’ordre des listes', () => {
    expect(empreinteSeance({ ...contenu, promotionIds: ['p1', 'p2'] })).toBe(fichier);
  });

  it('l’empreinte distingue une activité hors maquette sans type', () => {
    expect(
      empreinteSeance({ ...contenu, type: null, moduleId: null, activite: 'Réunion' }),
    ).not.toBe(fichier);
  });

  it('RG-04-11 crée une séance inconnue', () => {
    expect(
      deciderReimport({ existante: null, empreinteFichier: fichier, versionConservee: 'scolaly' }),
    ).toBe('creer');
  });

  it('RG-04-11 ne change pas une séance identique', () => {
    expect(
      deciderReimport({
        existante: { empreinteImport: autre, empreinteActuelle: fichier },
        empreinteFichier: fichier,
        versionConservee: 'scolaly',
      }),
    ).toBe('inchangee');
  });

  it('RG-04-11 met à jour une séance changée dans le fichier seulement', () => {
    expect(
      deciderReimport({
        existante: { empreinteImport: autre, empreinteActuelle: autre },
        empreinteFichier: fichier,
        versionConservee: 'scolaly',
      }),
    ).toBe('mettre-a-jour');
  });

  it.each([
    ['scolaly', 'conserver'],
    ['fichier', 'mettre-a-jour'],
  ] as const)(
    'RG-04-12 séance modifiée dans Scolaly : version %s gardée',
    (versionConservee, decision) => {
      expect(
        deciderReimport({
          existante: {
            empreinteImport: autre,
            empreinteActuelle: empreinteSeance({ ...contenu, type: 'cm' }),
          },
          empreinteFichier: fichier,
          versionConservee,
        }),
      ).toBe(decision);
    },
  );
});

describe('RG-04-11 annulation des séances disparues du fichier', () => {
  const maintenant = new Date('2026-10-09T10:00:00Z');
  const demain = new Date('2026-10-10T08:00:00Z');

  it('RG-04-11 une séance à venir sans appel est annulable', () => {
    expect(refusAnnulationDisparue({ debut: demain, presences: 0, maintenant })).toBeNull();
  });

  it('RG-04-11 une séance dont l’appel est fait ne s’annule pas', () => {
    expect(refusAnnulationDisparue({ debut: demain, presences: 3, maintenant })).toBe('appel-fait');
  });

  it('RG-04-11 une séance commencée ou passée ne s’annule pas', () => {
    expect(refusAnnulationDisparue({ debut: maintenant, presences: 0, maintenant })).toBe('passee');
  });
});
