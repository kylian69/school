import { describe, expect, it } from 'vitest';
import {
  calculerResultats,
  type DossierApprenant,
  type EntreeCalcul,
  type EvaluationNote,
} from './calcul.js';
import type { NiveauMaitrise } from './competences.js';
import { heuresVides, type Maquette } from './maquette.js';
import {
  REGLES_VALIDATION_PAR_DEFAUT,
  type RegleActivee,
  type ReglesValidation,
} from './regles.js';

/**
 * Maquette d'essai, une année : S1 = UE1 (M1, M2) + UE2 (M3) ; S2 = UE3 (M4). Le bloc BC1 regroupe
 * UE1 et UE3 ; UE2 est hors bloc. UE5 (M5) appartient à l'option « anglais », UE6 (M6) à
 * l'option « espagnol ». UE7 (M7, sport) sert d'UE bonus quand une règle la désigne.
 */
const ue = (
  id: string,
  semestre: number | null,
  ects: number,
  coefficient: number,
  extra = {},
) => ({
  id,
  code: id.toUpperCase(),
  blocId: null as string | null,
  annee: 1,
  semestre,
  ects,
  coefficient,
  option: null as string | null,
  ...extra,
});
const module = (id: string, ueId: string, coefficient = 1) => ({
  id,
  code: id.toUpperCase(),
  ueId,
  coefficient,
  heures: heuresVides(),
});

const MAQUETTE: Maquette = {
  blocs: [{ id: 'bc1', code: 'BC1' }],
  ues: [
    ue('ue1', 1, 18, 3, { blocId: 'bc1' }),
    ue('ue2', 1, 12, 2),
    ue('ue3', 2, 30, 1, { blocId: 'bc1' }),
  ],
  modules: [module('m1', 'ue1'), module('m2', 'ue1'), module('m3', 'ue2'), module('m4', 'ue3')],
};

const ECHELLE: NiveauMaitrise[] = [
  { id: 'na', libelle: 'Non acquis', ordre: 1, valide: false },
  { id: 'ac', libelle: 'Acquis', ordre: 2, valide: true },
];

const note = (moduleId: string, valeur: number | null, extra: Partial<EvaluationNote> = {}) => ({
  moduleId,
  type: 'examen',
  coefficient: 1,
  note: valeur,
  sur: 20,
  absence: null,
  ...extra,
});

const notes = (m1: number, m2: number, m3: number, m4: number) => [
  note('m1', m1),
  note('m2', m2),
  note('m3', m3),
  note('m4', m4),
];

function calculer(
  evaluations: EvaluationNote[],
  options: {
    regles?: Partial<ReglesValidation>;
    particulieres?: RegleActivee[];
    dossier?: Partial<DossierApprenant>;
    maquette?: Maquette;
  } = {},
) {
  const entree: EntreeCalcul = {
    maquette: options.maquette ?? MAQUETTE,
    annee: 1,
    competences: [
      { id: 'c1', code: 'C1', blocId: 'bc1' },
      { id: 'c2', code: 'C2', blocId: 'bc1' },
    ],
    echelle: ECHELLE,
    regles: { ...REGLES_VALIDATION_PAR_DEFAUT, ...options.regles },
    reglesParticulieres: options.particulieres ?? [],
    dossier: {
      option: null,
      evaluations,
      bonusAccordes: [],
      pointsJury: [],
      niveauxCompetences: {},
      ...options.dossier,
    },
  };
  return calculerResultats(entree);
}

const ueDe = (r: ReturnType<typeof calculer>, id: string) => r.ues.find((u) => u.id === id);

describe('RG-02-07 mode LMD (compensation)', () => {
  it('cas 1 · tout au-dessus du seuil : admis, toutes les UE et leurs ECTS, mention', () => {
    const r = calculer(notes(14, 12, 13, 15));
    expect(ueDe(r, 'ue1')).toMatchObject({ moyenne: 13, acquise: true, par: 'moyenne', ects: 18 });
    expect(r.periodes).toEqual([
      { cle: 'A1-S1', semestre: 1, moyenne: 13, validee: true, par: 'moyenne' },
      { cle: 'A1-S2', semestre: 2, moyenne: 15, validee: true, par: 'moyenne' },
    ]);
    expect(r).toMatchObject({
      moyenneGenerale: 13.33,
      admis: true,
      mention: 'Assez bien',
      ects: 60,
    });
  });

  it('cas 2 · les UE se compensent dans le semestre : semestre validé, UE acquise par compensation', () => {
    const r = calculer(notes(13, 13, 8, 12));
    expect(ueDe(r, 'ue2')).toMatchObject({
      moyenne: 8,
      acquise: true,
      par: 'compensation',
      ects: 12,
    });
    expect(r.periodes[0]).toMatchObject({ moyenne: 11, validee: true, par: 'compensation' });
    expect(r).toMatchObject({ admis: true, ects: 60 });
  });

  it('cas 3 · semestre sous le seuil : non validé, seules les UE acquises gardent leurs ECTS', () => {
    const r = calculer(notes(9, 9, 12, 14));
    expect(r.periodes[0]).toMatchObject({ moyenne: 10.2, validee: true });
    const r2 = calculer(notes(8, 8, 11, 14));
    expect(r2.periodes[0]).toMatchObject({ moyenne: 9.2, validee: false, par: null });
    expect(ueDe(r2, 'ue1')).toMatchObject({ acquise: false, ects: 0 });
    expect(r2).toMatchObject({ admis: false, mention: null, ects: 42 });
  });

  it('cas 4 · une note éliminatoire empêche la compensation de son UE', () => {
    const r = calculer(notes(15, 15, 5, 14), { regles: { noteEliminatoire: 6 } });
    expect(r.modules.find((m) => m.id === 'm3')).toMatchObject({ moyenne: 5, eliminatoire: true });
    expect(ueDe(r, 'ue2')).toMatchObject({ acquise: false, eliminatoire: true });
    expect(r.periodes[0]).toMatchObject({ moyenne: 11, validee: false });
    expect(r.admis).toBe(false);
  });

  it('cas 5 · option : compensation entre les semestres par la moyenne de l’année', () => {
    const sans = calculer(notes(13, 13, 13, 9));
    expect(sans.periodes[1]).toMatchObject({ validee: false });
    expect(sans.admis).toBe(false);
    const avec = calculer(notes(13, 13, 13, 9), { regles: { compensationSemestres: true } });
    expect(avec.periodes[1]).toMatchObject({ validee: true, par: 'compensation' });
    expect(ueDe(avec, 'ue3')).toMatchObject({ acquise: true, par: 'compensation', ects: 30 });
    expect(avec).toMatchObject({ moyenneGenerale: 12.33, admis: true, ects: 60 });
  });

  it('cas 6 · la compensation entre semestres ne joue pas sous le seuil ni avec une note éliminatoire', () => {
    const basse = calculer(notes(9, 9, 9, 5), { regles: { compensationSemestres: true } });
    expect(basse.admis).toBe(false);
    const eliminee = calculer(notes(16, 16, 16, 5), {
      regles: { compensationSemestres: true, noteEliminatoire: 6 },
    });
    expect(eliminee.moyenneGenerale).toBe(14.17);
    expect(eliminee.admis).toBe(false);
  });

  it('cas 7 · sans compensation entre modules, un module sous le seuil bloque l’UE mais le semestre compense', () => {
    const r = calculer(notes(8, 14, 12, 12), { regles: { compensationModules: false } });
    expect(ueDe(r, 'ue1')).toMatchObject({ moyenne: 11, acquise: true, par: 'compensation' });
    expect(r.periodes[0]?.par).toBe('compensation');
  });

  it('cas 8 · notes manquantes : moyennes partielles, décisions en attente', () => {
    const r = calculer([note('m1', 12), note('m3', 14), note('m4', 9)]);
    expect(ueDe(r, 'ue1')).toMatchObject({ moyenne: 12, acquise: null, par: null });
    expect(r.periodes[0]).toMatchObject({ validee: null });
    expect(r.periodes[1]).toMatchObject({ validee: false });
    expect(r).toMatchObject({ admis: false, mention: null });
    const attente = calculer([note('m1', 12)]);
    expect(attente.admis).toBeNull();
    expect(calculer([], { maquette: { blocs: [], ues: [], modules: [] } }).admis).toBeNull();
  });

  it('cas 9 · convertit les notes sur un autre barème et pondère par coefficient', () => {
    const r = calculer([
      note('m1', 15, { sur: 30 }),
      note('m1', 16, { coefficient: 3 }),
      note('m2', 10),
      note('m3', 10),
      note('m4', 10),
    ]);
    expect(r.modules[0]?.moyenne).toBe(14.5);
  });

  it('cas 10 · un module de coefficient nul et une UE sans module ne comptent pas', () => {
    const maquette: Maquette = {
      ...MAQUETTE,
      ues: [...MAQUETTE.ues, ue('ue4', 2, 0, 1)],
      modules: [...MAQUETTE.modules, module('m9', 'ue1', 0)],
    };
    const r = calculer([...notes(12, 12, 12, 12), note('m9', 0)], { maquette });
    expect(ueDe(r, 'ue1')?.moyenne).toBe(12);
    expect(ueDe(r, 'ue4')).toMatchObject({ moyenne: null, acquise: null });
    expect(r.periodes[1]?.validee).toBeNull();
    expect(r.admis).toBeNull();
  });

  it('cas 11 · une évaluation de coefficient nul ne compte pas', () => {
    const r = calculer([note('m1', 4, { coefficient: 0 }), ...notes(12, 12, 12, 12).slice(1)]);
    expect(r.modules[0]?.moyenne).toBeNull();
  });
});

describe('RG-02-07 mode sans compensation', () => {
  it('cas 12 · chaque UE doit être validée : une UE sous le seuil fait échouer l’année', () => {
    const r = calculer(notes(15, 15, 8, 15), { regles: { mode: 'sans_compensation' } });
    expect(ueDe(r, 'ue2')).toMatchObject({ acquise: false, ects: 0 });
    expect(r.periodes[0]).toMatchObject({ validee: false });
    expect(r).toMatchObject({ admis: false, ects: 48 });
  });

  it('cas 13 · toutes les UE validées : admis', () => {
    const r = calculer(notes(10, 10, 10, 10), { regles: { mode: 'sans_compensation' } });
    expect(r).toMatchObject({ admis: true, mention: null, ects: 60 });
  });

  it('cas 14 · sans compensation entre modules, un module sous le seuil invalide l’UE', () => {
    const r = calculer(notes(8, 14, 12, 12), {
      regles: { mode: 'sans_compensation', compensationModules: false },
    });
    expect(ueDe(r, 'ue1')).toMatchObject({ moyenne: 11, acquise: false });
    expect(r.admis).toBe(false);
  });

  it('cas 15 · décision en attente tant qu’une UE n’est pas notée', () => {
    expect(
      calculer([note('m1', 12), note('m2', 12)], { regles: { mode: 'sans_compensation' } }).admis,
    ).toBeNull();
    expect(
      calculer([], {
        regles: { mode: 'sans_compensation' },
        maquette: { blocs: [], ues: [], modules: [] },
      }).admis,
    ).toBeNull();
  });
});

describe('RG-02-07 mode blocs de compétences (RNCP)', () => {
  const blocs = { mode: 'blocs' } as const;

  it('cas 16 · les UE se compensent dans le bloc, sans compensation entre blocs', () => {
    const r = calculer(notes(12, 12, 14, 7), { regles: blocs });
    expect(r.blocs[0]).toMatchObject({
      moyenne: 10.75,
      valideParNotes: true,
      valide: true,
      competences: null,
    });
    expect(ueDe(r, 'ue3')).toMatchObject({ acquise: true, par: 'compensation', ects: 30 });
    expect(r).toMatchObject({ admis: true, ects: 60 });
  });

  it('cas 17 · un bloc sous le seuil n’est pas validé ; une UE hors bloc doit être acquise', () => {
    const r = calculer(notes(9, 9, 14, 9), { regles: blocs });
    expect(r.blocs[0]).toMatchObject({ valide: false });
    expect(r.admis).toBe(false);
    const horsBloc = calculer(notes(14, 14, 8, 14), { regles: blocs });
    expect(horsBloc.blocs[0]?.valide).toBe(true);
    expect(horsBloc.admis).toBe(false);
  });

  it('cas 18 · bloc en attente tant qu’il manque des notes', () => {
    const r = calculer([note('m1', 12), note('m3', 12)], { regles: blocs });
    expect(r.blocs[0]).toMatchObject({ valideParNotes: null, valide: null });
    expect(r.admis).toBeNull();
    expect(
      calculer([], { regles: blocs, maquette: { blocs: [], ues: [], modules: [] } }).admis,
    ).toBe(false);
  });

  it('cas 19 · validation par les compétences seules : toutes « acquis », et pas avant', () => {
    const regles = {
      mode: 'blocs',
      modeEvaluation: 'competences',
      validationBlocs: 'competences',
    } as const;
    const incomplet = calculer([], {
      regles,
      dossier: { niveauxCompetences: { c1: 'ac', c2: 'na' } },
    });
    expect(incomplet.blocs[0]).toMatchObject({
      valide: false,
      competences: { manquantes: ['C2'] },
    });
    expect(incomplet.admis).toBe(false);
    const complet = calculer(notes(2, 2, 2, 2), {
      regles,
      dossier: { niveauxCompetences: { c1: 'ac', c2: 'ac' } },
    });
    expect(complet.modules[0]?.moyenne).toBeNull();
    expect(complet.blocs[0]).toMatchObject({ valideParNotes: null, valide: true });
    expect(complet.admis).toBe(true);
  });

  it('cas 20 · « les deux » : bloc validé par les notes mais pas par les compétences = non validé', () => {
    const regles = {
      mode: 'blocs',
      modeEvaluation: 'les_deux',
      validationBlocs: 'les_deux',
    } as const;
    const r = calculer(notes(14, 14, 14, 14), {
      regles,
      dossier: { niveauxCompetences: { c1: 'ac' } },
    });
    expect(r.blocs[0]).toMatchObject({
      valideParNotes: true,
      valide: false,
      competences: { manquantes: ['C2'] },
    });
    expect(r.admis).toBe(false);
    const ok = calculer(notes(14, 14, 14, 14), {
      regles,
      dossier: { niveauxCompetences: { c1: 'ac', c2: 'ac' } },
    });
    expect(ok.admis).toBe(true);
    const attente = calculer([], { regles });
    expect(attente.blocs[0]?.valide).toBeNull();
  });
});

describe('RG-02-15 options', () => {
  const maquette: Maquette = {
    blocs: [],
    ues: [
      ue('ue1', 1, 30, 1),
      ue('ue5', 2, 30, 1, { option: 'anglais' }),
      ue('ue6', 2, 30, 1, { option: 'espagnol' }),
    ],
    modules: [module('m1', 'ue1'), module('m5', 'ue5'), module('m6', 'ue6')],
  };

  it('l’apprenant n’est évalué que sur les UE de son option', () => {
    const r = calculer([note('m1', 12), note('m5', 14), note('m6', 2)], {
      maquette,
      dossier: { option: 'anglais' },
    });
    expect(r.ues.map((u) => u.id)).toEqual(['ue1', 'ue5']);
    expect(r).toMatchObject({ moyenneGenerale: 13, admis: true, ects: 60 });
  });

  it('sans option, les UE à option ne sont pas suivies', () => {
    expect(calculer([note('m1', 12)], { maquette }).ues.map((u) => u.id)).toEqual(['ue1']);
  });
});

describe('RG-02-26 et RG-02-27 règles particulières', () => {
  const generale = { niveau: 'generale' } as const;

  it('pondération par type d’évaluation : contrôle continu 40 %, examen 60 %', () => {
    const ponderation: RegleActivee = {
      id: 'p',
      libelle: 'CC 40 % / examen 60 %',
      regle: {
        type: 'ponderation',
        poids: [
          { typeEvaluation: 'controle_continu', poids: 40 },
          { typeEvaluation: 'examen', poids: 60 },
        ],
      },
    };
    const r = calculer(
      [
        note('m1', 10, { type: 'controle_continu' }),
        note('m1', 14, { type: 'controle_continu' }),
        note('m1', 8),
        note('m1', 20, { type: 'oral' }),
        note('m2', 15),
      ],
      { particulieres: [ponderation] },
    );
    expect(r.modules[0]?.moyenne).toBe(9.6);
    expect(r.modules[1]?.moyenne).toBe(15);
    expect(r.anomalies).toEqual([
      'Module M1 : le type d’évaluation « oral » n’a pas de poids dans la pondération ; ses notes sont ignorées.',
    ]);
  });

  it('note plafonnée et plancher selon le type d’évaluation', () => {
    const r = calculer(
      [note('m1', 16, { type: 'rattrapage' }), note('m2', 3, { type: 'projet' }), note('m3', 3)],
      {
        particulieres: [
          {
            id: 'pl',
            libelle: 'Rattrapage plafonné à 10',
            regle: { type: 'plafond', typeEvaluation: 'rattrapage', sens: 'plafond', valeur: 10 },
          },
          {
            id: 'pc',
            libelle: 'Projet au moins 5',
            regle: { type: 'plafond', typeEvaluation: 'projet', sens: 'plancher', valeur: 5 },
          },
        ],
      },
    );
    expect(r.modules.map((m) => m.moyenne).slice(0, 3)).toEqual([10, 5, 3]);
    expect(r.explications).toEqual([
      {
        regleId: 'pl',
        libelle: 'Rattrapage plafonné à 10',
        type: 'plafond',
        cible: { niveau: 'evaluation', moduleId: 'm1', type: 'rattrapage' },
        avant: 16,
        apres: 10,
      },
      {
        regleId: 'pc',
        libelle: 'Projet au moins 5',
        type: 'plafond',
        cible: { niveau: 'evaluation', moduleId: 'm2', type: 'projet' },
        avant: 3,
        apres: 5,
      },
    ]);
  });

  it('pénalité d’absence : absence non justifiée = 0, absence justifiée neutralisée', () => {
    const penalite: RegleActivee = {
      id: 'abs',
      libelle: 'Absence non justifiée',
      regle: { type: 'penalite_absence', typeAbsence: 'injustifiee', note: 0 },
    };
    const r = calculer(
      [
        note('m1', 14),
        note('m1', null, { absence: 'injustifiee' }),
        note('m2', 14),
        note('m2', null, { absence: 'justifiee' }),
      ],
      { particulieres: [penalite] },
    );
    expect(r.modules.map((m) => m.moyenne).slice(0, 2)).toEqual([7, 14]);
    expect(r.explications[0]).toMatchObject({ type: 'penalite_absence', avant: 0, apres: 0 });
  });

  it('bonus en points sur la moyenne générale, plafonné', () => {
    const bonus: RegleActivee = {
      id: 'b',
      libelle: 'Bonus engagement',
      regle: {
        type: 'bonus',
        valeur: 0.5,
        unite: 'points',
        cible: generale,
        plafond: 13,
        automatique: true,
      },
    };
    expect(calculer(notes(12, 12, 12, 12), { particulieres: [bonus] }).moyenneGenerale).toBe(12.5);
    const r = calculer(notes(13, 13, 13, 13), { particulieres: [bonus] });
    expect(r.moyenneGenerale).toBe(13);
    expect(r.explications).toEqual([]);
  });

  it('bonus accordé à certains apprenants seulement, malus et pourcentage sur une UE ou un module', () => {
    const accorde: RegleActivee = {
      id: 'eng',
      libelle: 'Engagement associatif',
      regle: {
        type: 'bonus',
        valeur: 1,
        unite: 'points',
        cible: generale,
        plafond: null,
        automatique: false,
      },
    };
    const malus: RegleActivee = {
      id: 'retard',
      libelle: 'Malus de retard',
      regle: {
        type: 'bonus',
        valeur: -20,
        unite: 'pourcentage',
        cible: { niveau: 'ue', id: 'ue2' },
        plafond: null,
        automatique: true,
      },
    };
    const module3: RegleActivee = {
      id: 'mod',
      libelle: 'Bonus de module',
      regle: {
        type: 'bonus',
        valeur: 2,
        unite: 'points',
        cible: { niveau: 'module', id: 'm4' },
        plafond: null,
        automatique: true,
      },
    };
    const particulieres = [accorde, malus, module3];
    const sans = calculer(notes(12, 12, 10, 12), { particulieres });
    expect(ueDe(sans, 'ue2')?.moyenne).toBe(8);
    expect(sans.modules[3]?.moyenne).toBe(14);
    const avec = calculer(notes(12, 12, 10, 12), {
      particulieres,
      dossier: { bonusAccordes: ['eng'] },
    });
    expect((avec.moyenneGenerale ?? 0) - (sans.moyenneGenerale ?? 0)).toBeCloseTo(1);
  });

  it('UE bonus (sport) : seuls les points au-dessus de 10 comptent, divisés par 20', () => {
    const maquette: Maquette = {
      ...MAQUETTE,
      ues: [...MAQUETTE.ues, ue('ue7', 1, 0, 1)],
      modules: [...MAQUETTE.modules, module('m7', 'ue7')],
    };
    const sport: RegleActivee = {
      id: 'sport',
      libelle: 'Bonus sport',
      regle: {
        type: 'ue_bonus',
        source: { niveau: 'ue', id: 'ue7' },
        seuil: 10,
        diviseur: 20,
        cible: generale,
      },
    };
    const r = calculer([...notes(12, 12, 12, 12), note('m7', 16)], {
      maquette,
      particulieres: [sport],
    });
    expect(ueDe(r, 'ue7')).toMatchObject({ bonus: true, moyenne: 16 });
    expect(r.modules.find((m) => m.id === 'm7')?.bonus).toBe(true);
    expect(r.moyenneGenerale).toBe(12.3);
    expect(r.explications[0]).toMatchObject({ libelle: 'Bonus sport', avant: 12, apres: 12.3 });
    // Sans note de sport, ou sous le seuil, aucun point.
    expect(
      calculer(notes(12, 12, 12, 12), { maquette, particulieres: [sport] }).moyenneGenerale,
    ).toBe(12);
    expect(
      calculer([...notes(12, 12, 12, 12), note('m7', 8)], { maquette, particulieres: [sport] })
        .explications,
    ).toEqual([]);
    const sansSource: RegleActivee = {
      ...sport,
      regle: { ...sport.regle, source: null } as typeof sport.regle,
    };
    expect(
      calculer([...notes(12, 12, 12, 12), note('m7', 16)], {
        maquette,
        particulieres: [sansSource],
      }).moyenneGenerale,
    ).toBe(12.57);
    const diviseurNul: RegleActivee = {
      ...sport,
      regle: { ...sport.regle, diviseur: 0 } as typeof sport.regle,
    };
    expect(
      calculer([...notes(12, 12, 12, 12), note('m7', 16)], {
        maquette,
        particulieres: [diviseurNul],
      }).moyenneGenerale,
    ).toBe(12);
  });

  it('module bonus : retiré de son UE', () => {
    const maquette: Maquette = { ...MAQUETTE, modules: [...MAQUETTE.modules, module('m8', 'ue1')] };
    const r = calculer([...notes(12, 12, 12, 12), note('m8', 20)], {
      maquette,
      particulieres: [
        {
          id: 'mb',
          libelle: 'Module bonus',
          regle: {
            type: 'ue_bonus',
            source: { niveau: 'module', id: 'm8' },
            seuil: 10,
            diviseur: 10,
            cible: { niveau: 'ue', id: 'ue1' },
          },
        },
      ],
    });
    expect(ueDe(r, 'ue1')?.moyenne).toBe(13);
  });

  describe('points de jury', () => {
    const jury: RegleActivee = {
      id: 'jury',
      libelle: 'Points de jury',
      regle: { type: 'points_jury', maximum: 0.3, seuils: [10, 12] },
    };
    const calculerJury = (
      points: number,
      motif = 'Assiduité exemplaire',
      regleId = 'jury',
      regle = jury,
    ) =>
      calculer(notes(9.8, 9.8, 9.8, 9.8), {
        particulieres: [regle],
        dossier: { pointsJury: [{ regleId, cible: generale, points, motif }] },
      });

    it('ajoutent juste ce qu’il faut pour atteindre le seuil, avec un motif', () => {
      const r = calculerJury(0.3);
      expect(r.moyenneGenerale).toBe(10);
      expect(r.explications).toEqual([
        {
          regleId: 'jury',
          libelle: 'Points de jury',
          type: 'points_jury',
          cible: generale,
          avant: 9.8,
          apres: 10,
        },
      ]);
    });

    it('sont ramenés au maximum, et ignorés sans motif ou sans seuil atteignable', () => {
      const plafonne = calculerJury(1);
      expect(plafonne.moyenneGenerale).toBe(10);
      expect(plafonne.anomalies).toEqual([
        'Points de jury : 1 points demandés, ramenés au maximum de 0.3.',
      ]);
      const sansMotif = calculerJury(0.3, '  ');
      expect(sansMotif.moyenneGenerale).toBe(9.8);
      expect(sansMotif.anomalies).toEqual([
        'Points de jury : points de jury ignorés, le motif est obligatoire.',
      ]);
      expect(calculerJury(0.1).anomalies).toEqual([
        'Points de jury : aucun seuil n’est atteignable avec ces points ; ils ne sont pas ajoutés.',
      ]);
      expect(calculerJury(0).moyenneGenerale).toBe(9.8);
      expect(calculerJury(0.3, 'Motif', 'autre').moyenneGenerale).toBe(9.8);
    });

    it('sans seuil, s’ajoutent entièrement', () => {
      const libre: RegleActivee = {
        ...jury,
        regle: { type: 'points_jury', maximum: 0.5, seuils: [] },
      };
      expect(calculerJury(0.5, 'Motif', 'jury', libre).moyenneGenerale).toBe(10.3);
    });
  });

  it('combinées : appliquées et expliquées dans l’ordre de RG-02-27', () => {
    const particulieres: RegleActivee[] = [
      { id: 'jury', libelle: 'Jury', regle: { type: 'points_jury', maximum: 0.5, seuils: [10] } },
      {
        id: 'bonus',
        libelle: 'Bonus',
        regle: {
          type: 'bonus',
          valeur: 0.2,
          unite: 'points',
          cible: generale,
          plafond: null,
          automatique: true,
        },
      },
      {
        id: 'abs',
        libelle: 'Absence',
        regle: { type: 'penalite_absence', typeAbsence: 'injustifiee', note: 0 },
      },
      {
        id: 'pl',
        libelle: 'Rattrapage',
        regle: { type: 'plafond', typeEvaluation: 'rattrapage', sens: 'plafond', valeur: 10 },
      },
    ];
    const r = calculer(
      [
        note('m1', 12),
        note('m1', null, { absence: 'injustifiee' }),
        note('m2', 15, { type: 'rattrapage' }),
        note('m3', 11),
        note('m4', 11),
      ],
      {
        particulieres,
        dossier: {
          pointsJury: [{ regleId: 'jury', cible: generale, points: 0.5, motif: 'Progrès' }],
        },
      },
    );
    expect(r.explications.map((e) => e.type)).toEqual([
      'plafond',
      'penalite_absence',
      'bonus',
      'points_jury',
    ]);
    // M1 = 6, M2 = 10 → UE1 = 8 ; générale = (8×3 + 11×2 + 11)/6 = 9,5 ; +0,2 → 9,7 ; jury → 10.
    expect(r.moyenneGenerale).toBe(10);
  });
});
