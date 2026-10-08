import { describe, expect, it } from 'vitest';
import {
  conflitsBloquants,
  creneauxLibres,
  detecterConflits,
  sallesLibres,
  verifierForcage,
  verifierPublicationSeance,
  type Conflit,
  type ContexteConflits,
  type OptionsCreneaux,
  type SalleEdt,
  type SeancePlanifiee,
} from './conflits.js';
import { instantLocal } from './recurrence.js';

const fuseau = 'Europe/Paris';

// Semaine du lundi 5 octobre 2026 ; groupes G1 (A, B), G2 (C), G3 (B, D).
function seance(
  id: string,
  jour: string,
  heureDebut: string,
  heureFin: string,
  autres: Partial<SeancePlanifiee> = {},
): SeancePlanifiee {
  return {
    id,
    debut: instantLocal(jour, heureDebut, fuseau),
    fin: instantLocal(jour, heureFin, fuseau),
    statut: 'brouillon',
    type: 'cm',
    moduleId: null,
    salleId: null,
    intervenantIds: [],
    groupeIds: [],
    ...autres,
  };
}

const salle = (id: string, autres: Partial<SalleEdt> = {}): SalleEdt => ({
  id,
  type: 'cours',
  capacite: 30,
  equipements: [],
  statut: 'disponible',
  ...autres,
});

function contexte(autres: Partial<ContexteConflits> = {}): ContexteConflits {
  return {
    fuseau,
    seances: [],
    apprenantsParGroupe: { G1: ['A', 'B'], G2: ['C'], G3: ['B', 'D'] },
    salles: {
      S1: salle('S1'),
      S2: salle('S2'),
      V: salle('V', { type: 'virtuelle', capacite: null }),
    },
    fermetures: [],
    joursEntreprise: {},
    stages: {},
    indisponibilites: [],
    disponibilites: [],
    volumesModules: {},
    ...autres,
  };
}

const codes = (conflits: readonly Conflit[]) => conflits.map((c) => c.code);

describe('RG-04-05 conflits bloquants d’occupation', () => {
  const cible = seance('X', '2026-10-06', '09:00', '12:00', {
    salleId: 'S1',
    intervenantIds: ['I1', 'I2'],
    groupeIds: ['G1'],
  });

  it('RG-04-05 signale la salle déjà occupée', () => {
    const autre = seance('Y', '2026-10-06', '11:00', '13:00', { salleId: 'S1' });
    expect(detecterConflits(cible, contexte({ seances: [autre] }))).toEqual([
      { code: 'salle-occupee', niveau: 'bloquant', seanceId: 'Y' },
    ]);
  });

  it('RG-04-05 accepte deux séances qui se suivent ou une autre salle', () => {
    const seances = [
      seance('Y', '2026-10-06', '12:00', '13:00', { salleId: 'S1' }),
      seance('Z', '2026-10-06', '08:00', '09:00', { salleId: 'S1' }),
      seance('W', '2026-10-06', '10:00', '11:00', { salleId: 'S2' }),
    ];
    expect(detecterConflits(cible, contexte({ seances }))).toEqual([]);
  });

  it('RG-04-05 ne met jamais la salle virtuelle en conflit', () => {
    const enVisio = { ...cible, salleId: 'V', intervenantIds: [], groupeIds: [] };
    const autre = seance('Y', '2026-10-06', '09:00', '12:00', { salleId: 'V' });
    expect(detecterConflits(enVisio, contexte({ seances: [autre] }))).toEqual([]);
  });

  it('RG-04-05 compte les brouillons, ignore les séances annulées, reportées et la séance elle-même', () => {
    const seances = [
      { ...cible, salleId: 'S1' },
      seance('Y', '2026-10-06', '09:00', '10:00', { salleId: 'S1', statut: 'annulee' }),
      seance('Z', '2026-10-06', '09:00', '10:00', { salleId: 'S1', statut: 'reportee' }),
      seance('W', '2026-10-06', '09:00', '10:00', { salleId: 'S1', statut: 'publiee' }),
    ];
    expect(codes(detecterConflits(cible, contexte({ seances })))).toEqual(['salle-occupee']);
  });

  it('RG-04-05 ne contrôle pas une séance annulée ou reportée', () => {
    const autre = seance('Y', '2026-10-06', '09:00', '12:00', { salleId: 'S1' });
    for (const statut of ['annulee', 'reportee'] as const)
      expect(detecterConflits({ ...cible, statut }, contexte({ seances: [autre] }))).toEqual([]);
  });

  it('RG-04-05 signale l’intervenant déjà en séance', () => {
    const autre = seance('Y', '2026-10-06', '08:00', '10:00', { intervenantIds: ['I2', 'I3'] });
    expect(detecterConflits(cible, contexte({ seances: [autre] }))).toEqual([
      { code: 'intervenant-occupe', niveau: 'bloquant', seanceId: 'Y', intervenantIds: ['I2'] },
    ]);
  });

  it('RG-04-05 signale le groupe déjà en séance', () => {
    const autre = seance('Y', '2026-10-06', '10:00', '11:00', { groupeIds: ['G1', 'G2'] });
    expect(detecterConflits(cible, contexte({ seances: [autre] }))).toEqual([
      {
        code: 'groupe-occupe',
        niveau: 'bloquant',
        seanceId: 'Y',
        groupeIds: ['G1'],
        apprenantIds: [],
      },
    ]);
  });

  it('RG-04-05 signale un apprenant déjà en séance par un autre groupe', () => {
    const autre = seance('Y', '2026-10-06', '10:00', '11:00', { groupeIds: ['G3'] });
    expect(detecterConflits(cible, contexte({ seances: [autre] }))).toEqual([
      {
        code: 'groupe-occupe',
        niveau: 'bloquant',
        seanceId: 'Y',
        groupeIds: [],
        apprenantIds: ['B'],
      },
    ]);
  });

  it('RG-04-05 ne signale rien pour des groupes sans apprenant commun ou inconnus', () => {
    const seances = [
      seance('Y', '2026-10-06', '10:00', '11:00', { groupeIds: ['G2'] }),
      seance('Z', '2026-10-06', '10:00', '11:00', { groupeIds: ['G9'] }),
    ];
    expect(detecterConflits({ ...cible, groupeIds: ['G1', 'G8'] }, contexte({ seances }))).toEqual(
      [],
    );
  });
});

describe('RG-04-05 jours fermés', () => {
  it('RG-04-05 bloque une séance un jour férié ou pendant les vacances', () => {
    const fermetures = [
      { dateDebut: '2026-11-11', dateFin: '2026-11-11' },
      { dateDebut: '2026-10-17', dateFin: '2026-11-01' },
    ];
    expect(
      detecterConflits(seance('X', '2026-11-11', '09:00', '10:00'), contexte({ fermetures })),
    ).toEqual([{ code: 'jour-ferme', niveau: 'bloquant', jours: ['2026-11-11'] }]);
    expect(
      codes(
        detecterConflits(seance('X', '2026-10-20', '09:00', '10:00'), contexte({ fermetures })),
      ),
    ).toEqual(['jour-ferme']);
    expect(
      detecterConflits(seance('X', '2026-11-02', '09:00', '10:00'), contexte({ fermetures })),
    ).toEqual([]);
  });

  it('RG-04-05 contrôle chaque jour d’une séance qui passe minuit', () => {
    const nuit = {
      ...seance('X', '2026-11-10', '22:00', '23:00'),
      fin: instantLocal('2026-11-11', '01:00', fuseau),
    };
    const fermetures = [{ dateDebut: '2026-11-11', dateFin: '2026-11-11' }];
    expect(detecterConflits(nuit, contexte({ fermetures }))).toEqual([
      { code: 'jour-ferme', niveau: 'bloquant', jours: ['2026-11-11'] },
    ]);
  });
});

describe('RG-03-13 et RG-03-24 jours entreprise et stages', () => {
  const cible = seance('X', '2026-10-06', '09:00', '12:00', { groupeIds: ['G1', 'G2'] });

  it('RG-03-13 avertit des apprenants en entreprise et RG-03-24 de ceux en stage', () => {
    const ctx = contexte({
      joursEntreprise: { A: ['2026-10-06'], C: ['2026-10-07'] },
      stages: {
        B: [{ dateDebut: '2026-10-01', dateFin: '2026-10-31' }],
        C: [{ dateDebut: '2026-11-01', dateFin: '2026-11-30' }],
      },
    });
    expect(detecterConflits(cible, ctx)).toEqual([
      {
        code: 'jour-entreprise',
        niveau: 'avertissement',
        apprenants: [
          { apprenantId: 'A', raison: 'entreprise' },
          { apprenantId: 'B', raison: 'stage' },
        ],
        effectif: 3,
      },
    ]);
  });

  it('RG-03-13 ne signale rien quand tous les apprenants sont à l’école', () => {
    expect(detecterConflits(cible, contexte({ joursEntreprise: { A: ['2026-10-07'] } }))).toEqual(
      [],
    );
  });
});

describe('RG-04-05 capacité de la salle', () => {
  const cible = (salleId: string) =>
    seance('X', '2026-10-06', '09:00', '12:00', { salleId, groupeIds: ['G1', 'G2'] });

  it('RG-04-05 avertit quand la capacité est inférieure à l’effectif', () => {
    const ctx = contexte({ salles: { P: salle('P', { capacite: 2 }) } });
    expect(detecterConflits(cible('P'), ctx)).toEqual([
      { code: 'capacite-salle', niveau: 'avertissement', capacite: 2, effectif: 3 },
    ]);
  });

  it('RG-04-05 accepte une capacité égale, inconnue, une salle virtuelle ou inconnue', () => {
    const ctx = contexte({
      salles: {
        P: salle('P', { capacite: 3 }),
        Q: salle('Q', { capacite: null }),
        V: salle('V', { type: 'virtuelle', capacite: 1 }),
      },
    });
    for (const id of ['P', 'Q', 'V', 'inconnue'])
      expect(detecterConflits(cible(id), ctx)).toEqual([]);
  });
});

describe('RG-04-18 intervenant indisponible', () => {
  const cible = seance('X', '2026-10-06', '09:00', '12:00', { intervenantIds: ['I1'] });
  const indispo = (debut: string, fin: string) => ({
    intervenantId: 'I1',
    debut: instantLocal('2026-10-06', debut, fuseau),
    fin: instantLocal('2026-10-06', fin, fuseau),
  });
  const avertissement = (raison: string) => [
    { code: 'intervenant-indisponible', niveau: 'avertissement', intervenantId: 'I1', raison },
  ];

  it('RG-04-18 avertit d’une indisponibilité ponctuelle qui chevauche la séance', () => {
    const ctx = contexte({ indisponibilites: [indispo('11:00', '14:00')] });
    expect(detecterConflits(cible, ctx)).toEqual(avertissement('indisponibilite'));
    const autre = contexte({
      indisponibilites: [
        indispo('12:00', '14:00'),
        { ...indispo('09:00', '12:00'), intervenantId: 'I2' },
      ],
    });
    expect(detecterConflits(cible, autre)).toEqual([]);
  });

  it('RG-04-18 accepte une séance comprise dans un créneau de disponibilité', () => {
    const disponibilites = [
      { intervenantId: 'I1', jourSemaine: 2, heureDebut: '08:00', heureFin: '13:00' },
      { intervenantId: 'I2', jourSemaine: 1, heureDebut: '08:00', heureFin: '09:00' },
    ];
    expect(detecterConflits(cible, contexte({ disponibilites }))).toEqual([]);
  });

  it.each([
    [{ jourSemaine: 1, heureDebut: '08:00', heureFin: '13:00' }],
    [{ jourSemaine: 2, heureDebut: '09:15', heureFin: '13:00' }],
    [{ jourSemaine: 2, heureDebut: '08:00', heureFin: '11:45' }],
  ])('RG-04-18 avertit d’une séance hors des créneaux déclarés (%o)', (creneau) => {
    const ctx = contexte({ disponibilites: [{ intervenantId: 'I1', ...creneau }] });
    expect(detecterConflits(cible, ctx)).toEqual(avertissement('hors-disponibilites'));
  });

  it('RG-04-18 avertit d’une séance sur deux jours hors des créneaux d’un jour', () => {
    const nuit = { ...cible, fin: instantLocal('2026-10-07', '01:00', fuseau) };
    const disponibilites = [
      { intervenantId: 'I1', jourSemaine: 2, heureDebut: '00:00', heureFin: '23:45' },
    ];
    expect(detecterConflits(nuit, contexte({ disponibilites }))).toEqual(
      avertissement('hors-disponibilites'),
    );
  });
});

describe('RG-04-05 volume du module', () => {
  const module = { moduleId: 'M1', type: 'td' as const, groupeIds: ['G1', 'G2'] };
  const cible = seance('X', '2026-10-06', '09:00', '12:00', module);
  const deja = [
    seance('Y', '2026-09-29', '09:00', '12:00', { ...module, groupeIds: ['G1'] }),
    seance('Z', '2026-09-22', '09:00', '12:00', {
      ...module,
      groupeIds: ['G2'],
      statut: 'annulee',
    }),
    seance('W', '2026-09-15', '09:00', '12:00', { ...module, groupeIds: ['G1'], type: 'cm' }),
    seance('V', '2026-09-08', '09:00', '12:00', { ...module, groupeIds: ['G1'], moduleId: 'M2' }),
  ];

  it('RG-04-05 avertit par groupe quand la maquette est dépassée', () => {
    const ctx = contexte({ seances: deja, volumesModules: { M1: { td: 300 } } });
    expect(detecterConflits(cible, ctx)).toEqual([
      {
        code: 'volume-module',
        niveau: 'avertissement',
        groupeId: 'G1',
        prevuMinutes: 300,
        planifieMinutes: 360,
      },
    ]);
  });

  it('RG-04-05 accepte un volume atteint sans dépassement', () => {
    expect(
      detecterConflits(cible, contexte({ seances: deja, volumesModules: { M1: { td: 360 } } })),
    ).toEqual([]);
  });

  it('RG-04-05 avertit d’un type prévu à zéro heure dans la maquette', () => {
    const ctx = contexte({ volumesModules: { M1: { td: 0 } } });
    expect(codes(detecterConflits(cible, ctx))).toEqual(['volume-module', 'volume-module']);
  });

  it('RG-04-05 ne suit ni un type sans volume, ni un module inconnu, ni une activité hors maquette', () => {
    const volumesModules = { M1: { cm: 60 } };
    for (const s of [cible, { ...cible, moduleId: 'M9' }, { ...cible, moduleId: null }])
      expect(detecterConflits(s, contexte({ seances: deja, volumesModules }))).toEqual([]);
  });
});

describe('RG-04-05 performance', () => {
  it('RG-04-05 contrôle une séance parmi 5 000 en moins de 300 ms', () => {
    const modele = seance('S', '2026-10-06', '09:00', '10:00', { moduleId: 'M1' });
    const seances = Array.from({ length: 5000 }, (_, i) => ({
      ...modele,
      id: `S${i}`,
      salleId: `R${i}`,
      intervenantIds: [`I${i}`],
      groupeIds: [`G${i}`],
    }));
    const cible = seance('X', '2026-10-06', '09:00', '10:00', {
      salleId: 'R1',
      intervenantIds: ['I2'],
      groupeIds: ['G3'],
    });
    const depart = performance.now();
    const conflits = detecterConflits(
      cible,
      contexte({ seances, apprenantsParGroupe: {}, volumesModules: { M1: { cm: 60 } } }),
    );
    expect(performance.now() - depart).toBeLessThan(300);
    expect(codes(conflits)).toEqual(['salle-occupee', 'intervenant-occupe', 'groupe-occupe']);
  });
});

describe('RG-04-06 forçage et publication', () => {
  const salleOccupee: Conflit = { code: 'salle-occupee', niveau: 'bloquant', seanceId: 'Y' };
  const groupeOccupe: Conflit = {
    code: 'groupe-occupe',
    niveau: 'bloquant',
    seanceId: 'Y',
    groupeIds: ['G1'],
    apprenantIds: [],
  };
  const intervenantOccupe: Conflit = {
    code: 'intervenant-occupe',
    niveau: 'bloquant',
    seanceId: 'Y',
    intervenantIds: ['I1'],
  };
  const capacite: Conflit = {
    code: 'capacite-salle',
    niveau: 'avertissement',
    capacite: 10,
    effectif: 12,
  };

  it('RG-04-06 force un conflit de salle ou de groupe avec un motif', () => {
    expect(verifierForcage(salleOccupee, '  cours commun ')).toEqual({
      ok: true,
      forcage: { code: 'salle-occupee', seanceId: 'Y', motif: 'cours commun' },
    });
    expect(verifierForcage(groupeOccupe, 'cours commun')).toMatchObject({ ok: true });
  });

  it('RG-04-06 refuse un forçage sans motif ou d’un autre conflit', () => {
    for (const motif of [null, undefined, '  '])
      expect(verifierForcage(salleOccupee, motif)).toEqual({ ok: false, refus: 'motif-requis' });
    for (const c of [
      intervenantOccupe,
      capacite,
      { code: 'jour-ferme', niveau: 'bloquant', jours: [] } as Conflit,
    ])
      expect(verifierForcage(c, 'motif')).toEqual({ ok: false, refus: 'non-forcable' });
  });

  it('RG-04-06 bloque la publication tant qu’un conflit bloquant n’est pas forcé', () => {
    const conflits = [salleOccupee, groupeOccupe, intervenantOccupe, capacite];
    expect(verifierPublicationSeance(conflits, [])).toEqual({
      ok: false,
      refus: 'conflits-bloquants',
      conflits: [salleOccupee, groupeOccupe, intervenantOccupe],
    });
    const forcages = [
      { code: 'salle-occupee' as const, seanceId: 'Y', motif: 'm' },
      { code: 'groupe-occupe' as const, seanceId: 'Z', motif: 'm' },
    ];
    expect(conflitsBloquants(conflits, forcages)).toEqual([groupeOccupe, intervenantOccupe]);
  });

  it('RG-04-06 publie avec des avertissements seuls ou des conflits forcés', () => {
    expect(verifierPublicationSeance([capacite], [])).toEqual({ ok: true });
    const forcages = [
      { code: 'salle-occupee' as const, seanceId: 'Y', motif: 'm' },
      { code: 'groupe-occupe' as const, seanceId: 'Y', motif: 'm' },
    ];
    expect(verifierPublicationSeance([salleOccupee, groupeOccupe, capacite], forcages)).toEqual({
      ok: true,
    });
  });
});

describe('RG-04-07 salles libres', () => {
  const cible = seance('X', '2026-10-06', '09:00', '12:00', {
    salleId: 'S1',
    groupeIds: ['G1', 'G2'],
  });
  const salles = {
    S1: salle('S1', { capacite: 20 }),
    Grande: salle('Grande', { capacite: 100, equipements: ['videoprojecteur', 'sono'] }),
    Moyenne: salle('Moyenne', { capacite: 20, equipements: ['videoprojecteur'] }),
    Bis: salle('Bis', { capacite: 20 }),
    Petite: salle('Petite', { capacite: 2 }),
    Inconnue: salle('Inconnue', { capacite: null }),
    Fermee: salle('Fermee', { statut: 'fermee' }),
    Info: salle('Info', { type: 'tp_informatique', capacite: 40 }),
    Prise: salle('Prise'),
    Liberee: salle('Liberee'),
    V: salle('V', { type: 'virtuelle', capacite: 500 }),
  };
  const seances = [
    cible,
    seance('Y', '2026-10-06', '10:00', '11:00', { salleId: 'Prise' }),
    seance('Z', '2026-10-06', '10:00', '11:00', { salleId: 'Liberee', statut: 'annulee' }),
  ];

  it('RG-04-07 propose les salles libres compatibles, la plus petite capacité d’abord', () => {
    expect(sallesLibres(cible, contexte({ salles, seances })).map((s) => s.id)).toEqual([
      'Bis',
      'Moyenne',
      'S1',
      'Liberee',
      'Info',
      'Grande',
    ]);
  });

  it('RG-04-07 filtre sur le type et les équipements demandés', () => {
    const ctx = contexte({ salles, seances });
    expect(sallesLibres(cible, ctx, { type: 'tp_informatique' }).map((s) => s.id)).toEqual([
      'Info',
    ]);
    expect(sallesLibres(cible, ctx, { equipements: ['videoprojecteur'] }).map((s) => s.id)).toEqual(
      ['Moyenne', 'Grande'],
    );
  });
});

describe('RG-04-07 créneaux libres les plus proches', () => {
  const cible = seance('X', '2026-10-06', '09:00', '11:00', {
    intervenantIds: ['I1'],
    groupeIds: ['G1'],
    moduleId: 'M1',
    salleId: 'S1',
  });
  const options: OptionsCreneaux = {
    plageDebut: '08:00',
    plageFin: '19:00',
    joursOuverts: [1, 2, 3, 4, 5],
    joursRecherche: 7,
    nombre: 3,
    apres: new Date('2026-01-01T00:00:00Z'),
  };
  const heure = (jour: string, h: string) => instantLocal(jour, h, fuseau);

  it('RG-04-07 propose les créneaux de même durée où groupe et intervenant sont libres', () => {
    const seances = [
      seance('Y', '2026-10-06', '08:00', '12:00', { intervenantIds: ['I1'] }),
      seance('Z', '2026-10-06', '12:00', '13:00', { groupeIds: ['G3'] }),
      seance('W', '2026-10-06', '13:00', '19:00', { salleId: 'S1' }),
    ];
    const ctx = contexte({ seances, volumesModules: { M1: { cm: 0 } } });
    expect(creneauxLibres(cible, ctx, options)).toEqual([
      { debut: heure('2026-10-06', '13:00'), fin: heure('2026-10-06', '15:00') },
      { debut: heure('2026-10-06', '13:15'), fin: heure('2026-10-06', '15:15') },
      { debut: heure('2026-10-06', '13:30'), fin: heure('2026-10-06', '15:30') },
    ]);
  });

  it('RG-04-07 départage deux créneaux à égale distance par le plus tôt', () => {
    const seances = [seance('Y', '2026-10-06', '08:00', '19:00', { intervenantIds: ['I1'] })];
    expect(
      creneauxLibres(cible, contexte({ seances }), {
        ...options,
        plageDebut: '09:00',
        plageFin: '11:00',
        nombre: 2,
      }),
    ).toEqual([
      { debut: heure('2026-10-05', '09:00'), fin: heure('2026-10-05', '11:00') },
      { debut: heure('2026-10-07', '09:00'), fin: heure('2026-10-07', '11:00') },
    ]);
  });

  it('RG-04-07 écarte les jours non ouverts, fermés, en entreprise, déjà passés et le créneau d’origine', () => {
    const ctx = contexte({
      fermetures: [{ dateDebut: '2026-10-07', dateFin: '2026-10-07' }],
      joursEntreprise: { A: ['2026-10-08'] },
      indisponibilites: [
        {
          intervenantId: 'I1',
          debut: heure('2026-10-09', '00:00'),
          fin: heure('2026-10-10', '00:00'),
        },
      ],
    });
    const resultat = creneauxLibres(cible, ctx, {
      ...options,
      plageDebut: '09:00',
      plageFin: '11:00',
      joursOuverts: [2, 3, 4, 5, 6],
      joursRecherche: 5,
      apres: heure('2026-10-06', '12:00'),
    });
    expect(resultat).toEqual([
      { debut: heure('2026-10-10', '09:00'), fin: heure('2026-10-10', '11:00') },
    ]);
  });
});
