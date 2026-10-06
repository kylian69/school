import type { InferInsertModel } from 'drizzle-orm';
import type {
  competence,
  competenceModule,
  formation,
  formationEtablissement,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  maquetteVersion,
} from '../schema/index.js';
import { SeededRandom } from './random.js';

/**
 * Référentiel de démonstration (I3.1) : formations fictives, sans code RNCP réel, avec une
 * maquette publiée pour la première année. Graine propre, pour ne pas changer les identifiants
 * du reste du jeu.
 */
const GRAINE = 20_261_102;
const CREATED_AT = new Date('2026-09-01T08:00:00Z');
const PUBLIEE_LE = new Date('2026-07-01T08:00:00Z');

export interface DemoReferentiel {
  formations: InferInsertModel<typeof formation>[];
  formationEtablissements: InferInsertModel<typeof formationEtablissement>[];
  versions: InferInsertModel<typeof maquetteVersion>[];
  blocs: InferInsertModel<typeof maquetteBloc>[];
  ues: InferInsertModel<typeof maquetteUe>[];
  modules: InferInsertModel<typeof maquetteModule>[];
  competences: InferInsertModel<typeof competence>[];
  competenceModules: InferInsertModel<typeof competenceModule>[];
}

type ModuleDemo = readonly [code: string, intitule: string, cm: number, td: number, tp: number];
interface UeDemo {
  code: string;
  intitule: string;
  semestre: 1 | 2;
  ects: number;
  coefficient: number;
  bloc: number;
  modules: readonly ModuleDemo[];
}
interface FormationDemo {
  ecole: number;
  intitule: string;
  type: 'bts' | 'bachelor';
  niveau: number;
  dureeAnnees: number;
  modes: ('initial' | 'apprentissage')[];
  blocs: readonly (readonly [code: string, intitule: string, competences: readonly string[]])[];
  ues: readonly UeDemo[];
}

const FORMATIONS: readonly FormationDemo[] = [
  {
    ecole: 0,
    intitule: 'Bachelor Gestion des organisations',
    type: 'bachelor',
    niveau: 6,
    dureeAnnees: 3,
    modes: ['initial', 'apprentissage'],
    blocs: [
      [
        'BC1',
        'Piloter la gestion financière',
        ['Établir un budget prévisionnel', 'Analyser les comptes annuels'],
      ],
      [
        'BC2',
        'Communiquer en contexte professionnel',
        ['Rédiger une note de synthèse', 'Échanger en anglais professionnel'],
      ],
    ],
    ues: [
      {
        code: 'UE1.1',
        intitule: 'Fondamentaux de la gestion',
        semestre: 1,
        ects: 18,
        coefficient: 3,
        bloc: 0,
        modules: [
          ['GES101', 'Comptabilité générale', 20, 20, 0],
          ['GES102', 'Mathématiques financières', 10, 20, 0],
          ['GES103', 'Introduction au droit des affaires', 20, 10, 0],
        ],
      },
      {
        code: 'UE1.2',
        intitule: 'Communication',
        semestre: 1,
        ects: 12,
        coefficient: 2,
        bloc: 1,
        modules: [
          ['COM101', 'Expression écrite', 0, 24, 0],
          ['COM102', 'Anglais professionnel', 0, 30, 0],
        ],
      },
      {
        code: 'UE2.1',
        intitule: 'Analyse financière',
        semestre: 2,
        ects: 18,
        coefficient: 3,
        bloc: 0,
        modules: [
          ['GES201', 'Analyse des comptes', 20, 20, 0],
          ['GES202', 'Tableur appliqué à la gestion', 0, 0, 24],
        ],
      },
      {
        code: 'UE2.2',
        intitule: 'Projet et anglais',
        semestre: 2,
        ects: 12,
        coefficient: 2,
        bloc: 1,
        modules: [
          ['COM201', 'Projet tutoré', 0, 10, 20],
          ['COM202', 'Anglais des affaires', 0, 30, 0],
        ],
      },
    ],
  },
  {
    ecole: 0,
    intitule: 'BTS Commerce et relation client',
    type: 'bts',
    niveau: 5,
    dureeAnnees: 2,
    modes: ['initial', 'apprentissage'],
    blocs: [['BC1', 'Développer la relation client', ['Accueillir et conseiller un client']]],
    ues: [
      {
        code: 'UE1',
        intitule: 'Relation client',
        semestre: 1,
        ects: 30,
        coefficient: 2,
        bloc: 0,
        modules: [
          ['RC101', 'Techniques de vente', 20, 30, 0],
          ['RC102', 'Culture économique', 30, 10, 0],
        ],
      },
      {
        code: 'UE2',
        intitule: 'Gestion commerciale',
        semestre: 2,
        ects: 30,
        coefficient: 2,
        bloc: 0,
        modules: [
          ['RC201', 'Gestion de l’offre', 20, 30, 0],
          ['RC202', 'Outils numériques', 0, 0, 30],
        ],
      },
    ],
  },
  {
    ecole: 1,
    intitule: 'Bachelor Développement web',
    type: 'bachelor',
    niveau: 6,
    dureeAnnees: 3,
    modes: ['initial', 'apprentissage'],
    blocs: [
      [
        'BC1',
        'Concevoir une application web',
        ['Modéliser des données', 'Développer une interface accessible'],
      ],
    ],
    ues: [
      {
        code: 'UE1',
        intitule: 'Programmation',
        semestre: 1,
        ects: 30,
        coefficient: 3,
        bloc: 0,
        modules: [
          ['DEV101', 'Algorithmique', 20, 20, 20],
          ['DEV102', 'Bases de données', 10, 10, 30],
        ],
      },
      {
        code: 'UE2',
        intitule: 'Web',
        semestre: 2,
        ects: 30,
        coefficient: 3,
        bloc: 0,
        modules: [
          ['DEV201', 'Développement front', 10, 10, 40],
          ['DEV202', 'Accessibilité numérique', 10, 20, 0],
        ],
      },
    ],
  },
];

/**
 * Construit le référentiel des écoles de démonstration. `etablissements` donne, pour chaque
 * école (dans l'ordre du jeu), ses établissements.
 */
export function buildDemoReferentiel(
  organisations: readonly string[],
  etablissements: readonly (readonly string[])[],
): DemoReferentiel {
  const random = new SeededRandom(GRAINE);
  const id = () => random.uuid(CREATED_AT);
  const jeu: DemoReferentiel = {
    formations: [],
    formationEtablissements: [],
    versions: [],
    blocs: [],
    ues: [],
    modules: [],
    competences: [],
    competenceModules: [],
  };
  for (const f of FORMATIONS) {
    const organisationId = organisations[f.ecole];
    if (!organisationId) continue;
    const commun = { organisationId, createdAt: CREATED_AT };
    const formationId = id();
    jeu.formations.push({
      ...commun,
      id: formationId,
      intitule: f.intitule,
      type: f.type,
      niveau: f.niveau,
      dureeAnnees: f.dureeAnnees,
      modes: f.modes,
    });
    for (const etablissementId of etablissements[f.ecole] ?? []) {
      jeu.formationEtablissements.push({ ...commun, id: id(), formationId, etablissementId });
    }
    const versionId = id();
    jeu.versions.push({
      ...commun,
      id: versionId,
      formationId,
      numero: 1,
      statut: 'publiee',
      publieeLe: PUBLIEE_LE,
      // Les valeurs absentes prennent les valeurs par défaut de RG-02-08.
      regles: { mode: 'lmd' },
    });
    const avecVersion = { ...commun, versionId };
    const blocs = f.blocs.map(([code, intitule], ordre) => {
      const blocId = id();
      jeu.blocs.push({ ...avecVersion, id: blocId, code, intitule, ordre });
      return blocId;
    });
    const modulesParBloc = new Map<string, string[]>();
    f.ues.forEach((ue, ordreUe) => {
      const ueId = id();
      const blocId = blocs[ue.bloc] ?? null;
      jeu.ues.push({
        ...avecVersion,
        id: ueId,
        blocId,
        code: ue.code,
        intitule: ue.intitule,
        annee: 1,
        semestre: ue.semestre,
        ects: ue.ects,
        coefficient: ue.coefficient,
        ordre: ordreUe,
      });
      ue.modules.forEach(([code, intitule, cm, td, tp], ordre) => {
        const moduleId = id();
        jeu.modules.push({
          ...avecVersion,
          id: moduleId,
          ueId,
          code,
          intitule,
          coefficient: 1,
          heuresCm: cm,
          heuresTd: td,
          heuresTp: tp,
          ordre,
        });
        if (blocId) modulesParBloc.set(blocId, [...(modulesParBloc.get(blocId) ?? []), moduleId]);
      });
    });
    f.blocs.forEach(([codeBloc, , competences], rang) => {
      const blocId = blocs[rang];
      if (!blocId) return;
      competences.forEach((intitule, ordre) => {
        const competenceId = id();
        jeu.competences.push({
          ...avecVersion,
          id: competenceId,
          blocId,
          code: `${codeBloc}.${String(ordre + 1)}`,
          intitule,
          ordre,
        });
        for (const moduleId of modulesParBloc.get(blocId) ?? []) {
          jeu.competenceModules.push({ ...commun, id: id(), competenceId, moduleId });
        }
      });
    });
  }
  return jeu;
}
