import type { TableauLu } from '../imports/csv.js';
import { normaliserNom } from '../personnes/doublons.js';
import { heuresVides, TYPES_HEURES, type Heures } from './maquette.js';

/**
 * Import d'une maquette depuis un tableur (US-02-02) et du référentiel de compétences (RG-02-21).
 * Une ligne par module (une UE sans module se décrit sur une ligne sans module : elle est créée
 * vide et signalée, module 02 section 7). Les en-têtes se reconnaissent sans tenir compte des
 * accents ni de la casse. Toute erreur est rapportée avec son numéro de ligne (en-tête = 1).
 */
export const COLONNES_MAQUETTE = [
  'Bloc',
  'Intitulé du bloc',
  'UE',
  'Intitulé de l’UE',
  'Année',
  'Semestre',
  'ECTS',
  'Coefficient UE',
  'Option',
  'Module',
  'Intitulé du module',
  'Coefficient module',
  'CM',
  'TD',
  'TP',
  'Projet',
  'E-learning',
] as const;

export const COLONNES_COMPETENCES = [
  'Bloc',
  'Intitulé du bloc',
  'Compétence',
  'Intitulé de la compétence',
  'Critères',
  'Modules',
] as const;

type Champ =
  | 'blocCode'
  | 'blocIntitule'
  | 'ueCode'
  | 'ueIntitule'
  | 'annee'
  | 'semestre'
  | 'ects'
  | 'ueCoefficient'
  | 'option'
  | 'moduleCode'
  | 'moduleIntitule'
  | 'moduleCoefficient'
  | 'competenceCode'
  | 'competenceIntitule'
  | 'criteres'
  | 'modules'
  | keyof Heures;

/** En-têtes reconnus (forme normalisée) pour chaque champ. */
const ALIAS: Record<Champ, readonly string[]> = {
  blocCode: ['bloc', 'code bloc', 'code du bloc', 'bloc de competences'],
  blocIntitule: ['intitule du bloc', 'intitule bloc', 'libelle du bloc'],
  ueCode: ['ue', 'code ue', 'code de l ue'],
  ueIntitule: ['intitule de l ue', 'intitule ue', 'libelle de l ue', 'libelle ue'],
  annee: ['annee', 'annee de formation'],
  semestre: ['semestre', 'periode'],
  ects: ['ects', 'credits', 'credits ects'],
  ueCoefficient: ['coefficient ue', 'coef ue', 'coefficient de l ue'],
  option: ['option'],
  moduleCode: ['module', 'code module', 'code du module'],
  moduleIntitule: ['intitule du module', 'intitule module', 'libelle du module', 'libelle module'],
  moduleCoefficient: ['coefficient module', 'coef module', 'coefficient du module'],
  cm: ['cm', 'heures cm'],
  td: ['td', 'heures td'],
  tp: ['tp', 'heures tp'],
  projet: ['projet', 'heures projet'],
  elearning: ['e learning', 'elearning', 'heures e learning'],
  competenceCode: ['competence', 'code competence', 'code de la competence'],
  competenceIntitule: ['intitule de la competence', 'intitule competence', 'libelle competence'],
  criteres: ['criteres', 'criteres d evaluation'],
  modules: ['modules', 'modules rattaches'],
};

function reperer(colonnes: readonly string[]): Map<Champ, number> {
  const positions = new Map<Champ, number>();
  colonnes.forEach((colonne, index) => {
    const forme = normaliserNom(colonne);
    for (const [champ, alias] of Object.entries(ALIAS) as [Champ, readonly string[]][]) {
      if (alias.includes(forme) && !positions.has(champ)) positions.set(champ, index);
    }
  });
  return positions;
}

export interface ErreurImport {
  ligne: number;
  message: string;
}

export interface BlocImporte {
  code: string;
  intitule: string;
}
export interface UeImportee {
  code: string;
  intitule: string;
  blocCode: string | null;
  annee: number;
  semestre: number | null;
  ects: number;
  coefficient: number;
  option: string | null;
}
export interface ModuleImporte {
  code: string;
  intitule: string;
  ueCode: string;
  coefficient: number;
  heures: Heures;
}
export interface CompetenceImportee {
  code: string;
  intitule: string;
  blocCode: string;
  criteres: string[];
  modules: string[];
}

export interface ResultatImportMaquette {
  blocs: BlocImporte[];
  ues: UeImportee[];
  modules: ModuleImporte[];
  erreurs: ErreurImport[];
  /** UE créées sans module (cas limite de la section 7). */
  uesSansModule: string[];
}

/** Nombre saisi avec une virgule ou un point ; vide : la valeur par défaut. */
function lireNombre(valeur: string, defaut: number): number | null {
  const texte = valeur.trim().replace(/\s/g, '').replace(',', '.');
  if (texte === '') return defaut;
  const n = Number(texte);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Semestre « 1 », « S2 », « S3 » (2e année), ou vide / « année » pour une UE annuelle. */
function lirePeriode(
  semestre: string,
  annee: string,
): { annee: number; semestre: number | null } | null {
  const an = lireNombre(annee, 0);
  if (an === null || !Number.isInteger(an)) return null;
  const forme = normaliserNom(semestre).replace(/^s(emestre)?\s*/, '');
  if (forme === '' || forme === 'annee' || forme === 'annuel' || forme === 'annuelle') {
    return { annee: Math.max(1, an), semestre: null };
  }
  const n = Number(forme);
  if (!Number.isInteger(n) || n < 1 || n > 16) return null;
  if (n <= 2) return { annee: Math.max(1, an), semestre: n };
  // Numérotation continue (S3 = 1er semestre de la 2e année).
  const deduite = Math.ceil(n / 2);
  if (an !== 0 && an !== deduite) return null;
  return { annee: deduite, semestre: ((n - 1) % 2) + 1 };
}

/** Colonnes obligatoires et leur nom dans le modèle. */
const REQUISES = {
  ueCode: 'UE',
  ueIntitule: 'Intitulé de l’UE',
  blocCode: 'Bloc',
  competenceCode: 'Compétence',
  competenceIntitule: 'Intitulé de la compétence',
} as const;

function colonnesManquantes(
  positions: Map<Champ, number>,
  requis: readonly (keyof typeof REQUISES)[],
): ErreurImport[] {
  const manquantes = requis.filter((c) => !positions.has(c)).map((c) => REQUISES[c]);
  if (manquantes.length === 0) return [];
  const pluriel = manquantes.length > 1 ? 's' : '';
  return [
    {
      ligne: 1,
      message: `Colonne${pluriel} absente${pluriel} : ${manquantes.join(', ')}. Reprenez le modèle à télécharger.`,
    },
  ];
}

/** Lit une maquette : blocs, UE et modules, avec contrôle ligne à ligne. */
export function lireImportMaquette(
  tableau: TableauLu,
  dureeAnnees: number,
): ResultatImportMaquette {
  const positions = reperer(tableau.colonnes);
  const erreurs: ErreurImport[] = colonnesManquantes(positions, ['ueCode', 'ueIntitule']);
  const resultat: ResultatImportMaquette = {
    blocs: [],
    ues: [],
    modules: [],
    erreurs,
    uesSansModule: [],
  };
  if (erreurs.length > 0) return resultat;
  const val = (ligne: readonly string[], champ: Champ) => {
    const index = positions.get(champ);
    return index === undefined ? '' : (ligne[index] ?? '').trim();
  };

  tableau.lignes.forEach((ligne, rang) => {
    const numero = rang + 2;
    const erreur = (message: string) => erreurs.push({ ligne: numero, message });
    const blocCode = val(ligne, 'blocCode');
    if (blocCode && !resultat.blocs.some((b) => b.code === blocCode)) {
      resultat.blocs.push({ code: blocCode, intitule: val(ligne, 'blocIntitule') || blocCode });
    }
    const ueCode = val(ligne, 'ueCode');
    if (!ueCode) {
      erreur('Le code de l’UE est vide.');
      return;
    }
    let periode = lirePeriode(val(ligne, 'semestre'), val(ligne, 'annee'));
    const ects = lireNombre(val(ligne, 'ects'), 0);
    const coefficient = lireNombre(val(ligne, 'ueCoefficient'), 1);
    if (!periode) erreur(`Année ou semestre illisible pour l’UE ${ueCode}.`);
    else if (periode.annee > dureeAnnees) {
      erreur(
        `L’UE ${ueCode} est en ${String(periode.annee)}e année : la formation dure ${String(dureeAnnees)} an(s).`,
      );
      periode = null;
    }
    if (ects === null) erreur(`ECTS illisibles pour l’UE ${ueCode}.`);
    if (coefficient === null) erreur(`Coefficient illisible pour l’UE ${ueCode}.`);
    const existante = resultat.ues.find((u) => u.code === ueCode);
    if (!existante) {
      if (periode && ects !== null && coefficient !== null) {
        resultat.ues.push({
          code: ueCode,
          intitule: val(ligne, 'ueIntitule') || ueCode,
          blocCode: blocCode || null,
          annee: periode.annee,
          semestre: periode.semestre,
          ects,
          coefficient,
          option: val(ligne, 'option') || null,
        });
      }
    } else if (
      (blocCode && existante.blocCode !== blocCode) ||
      (val(ligne, 'ects') && ects !== existante.ects)
    ) {
      erreur(`L’UE ${ueCode} est décrite différemment sur une ligne précédente (bloc ou ECTS).`);
      return;
    }

    const moduleCode = val(ligne, 'moduleCode');
    if (!moduleCode) return;
    if (resultat.modules.some((m) => m.code === moduleCode && m.ueCode === ueCode)) {
      erreur(`Le module ${moduleCode} apparaît deux fois dans l’UE ${ueCode}.`);
      return;
    }
    const coefModule = lireNombre(val(ligne, 'moduleCoefficient'), 1);
    const heures = heuresVides();
    let heuresLisibles = true;
    for (const type of TYPES_HEURES) {
      const h = lireNombre(val(ligne, type), 0);
      if (h === null) heuresLisibles = false;
      else heures[type] = h;
    }
    if (coefModule === null) erreur(`Coefficient illisible pour le module ${moduleCode}.`);
    if (!heuresLisibles) erreur(`Volumes horaires illisibles pour le module ${moduleCode}.`);
    if (coefModule !== null && heuresLisibles) {
      resultat.modules.push({
        code: moduleCode,
        intitule: val(ligne, 'moduleIntitule') || moduleCode,
        ueCode,
        coefficient: coefModule,
        heures,
      });
    }
  });
  if (tableau.lignes.length === 0)
    erreurs.push({ ligne: 2, message: 'Le fichier ne contient aucune ligne.' });
  resultat.uesSansModule = resultat.ues
    .filter((u) => !resultat.modules.some((m) => m.ueCode === u.code))
    .map((u) => u.code);
  return resultat;
}

export interface ResultatImportCompetences {
  blocs: BlocImporte[];
  competences: CompetenceImportee[];
  erreurs: ErreurImport[];
}

/** Lit un référentiel de compétences : critères séparés par « ; », modules par leurs codes. */
export function lireImportCompetences(tableau: TableauLu): ResultatImportCompetences {
  const positions = reperer(tableau.colonnes);
  const erreurs = colonnesManquantes(positions, [
    'blocCode',
    'competenceCode',
    'competenceIntitule',
  ]);
  const resultat: ResultatImportCompetences = { blocs: [], competences: [], erreurs };
  if (erreurs.length > 0) return resultat;
  const val = (ligne: readonly string[], champ: Champ) => {
    const index = positions.get(champ);
    return index === undefined ? '' : (ligne[index] ?? '').trim();
  };
  const liste = (texte: string, separateur: RegExp) =>
    texte
      .split(separateur)
      .map((x) => x.trim())
      .filter(Boolean);
  tableau.lignes.forEach((ligne, rang) => {
    const numero = rang + 2;
    const blocCode = val(ligne, 'blocCode');
    const code = val(ligne, 'competenceCode');
    const intitule = val(ligne, 'competenceIntitule');
    if (!blocCode || !code || !intitule) {
      erreurs.push({
        ligne: numero,
        message: 'Le bloc, le code et l’intitulé de la compétence sont obligatoires.',
      });
      return;
    }
    if (resultat.competences.some((c) => c.code === code && c.blocCode === blocCode)) {
      erreurs.push({
        ligne: numero,
        message: `La compétence ${code} apparaît deux fois dans le bloc ${blocCode}.`,
      });
      return;
    }
    if (!resultat.blocs.some((b) => b.code === blocCode)) {
      resultat.blocs.push({ code: blocCode, intitule: val(ligne, 'blocIntitule') || blocCode });
    }
    resultat.competences.push({
      code,
      intitule,
      blocCode,
      criteres: liste(val(ligne, 'criteres'), /[;\n]/),
      modules: liste(val(ligne, 'modules'), /[;,\s]+/),
    });
  });
  if (tableau.lignes.length === 0)
    erreurs.push({ ligne: 2, message: 'Le fichier ne contient aucune ligne.' });
  return resultat;
}
