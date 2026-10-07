import type { DatedTable } from '../dated-table.js';

/**
 * Tables réglementaires de l'alternance et des stages (module 03). Valeurs à relire avec un
 * juriste avant J7 : les tables portent `aValider`.
 */

/** Les 11 opérateurs de compétences agréés depuis le 1er avril 2019 (code → libellé). */
export const opcos: DatedTable<Readonly<Record<string, string>>> = {
  code: 'opcos',
  libelle: 'Opérateurs de compétences (OPCO)',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2019-04-01',
      fin: null,
      source:
        'Loi n° 2018-771 du 5 septembre 2018 et arrêtés d’agrément des opérateurs de compétences (2019)',
      valeur: {
        afdas: 'AFDAS',
        akto: 'AKTO',
        atlas: 'ATLAS',
        constructys: 'Constructys',
        ocapiat: 'OCAPIAT',
        'opco-2i': 'OPCO 2i',
        'opco-ep': 'OPCO EP',
        'opco-mobilites': 'OPCO Mobilités',
        'opco-sante': 'OPCO Santé',
        opcommerce: 'OPCOMMERCE',
        uniformation: 'Uniformation (OPCO Cohésion sociale)',
      },
    },
  ],
};

/**
 * Correspondance IDCC → OPCO (RG-03-02), proposée puis modifiable sur la fiche entreprise.
 * Extrait limité aux conventions les plus courantes, à compléter par l'import intégral de la
 * liste publiée par le ministère du Travail avant l'ouverture aux écoles pilotes.
 */
export const idccOpco: DatedTable<Readonly<Record<string, string>>> = {
  code: 'idcc-opco',
  libelle: 'Correspondance IDCC → OPCO',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2019-04-01',
      fin: null,
      source:
        'Arrêtés d’agrément des opérateurs de compétences (2019) et liste des conventions collectives par OPCO du ministère du Travail (extrait)',
      valeur: {
        '0016': 'opco-mobilites',
        '0573': 'opcommerce',
        '1090': 'opco-mobilites',
        '1486': 'atlas',
        '1501': 'akto',
        '1516': 'akto',
        '1596': 'constructys',
        '1597': 'constructys',
        '1979': 'akto',
        '2120': 'atlas',
        '2216': 'opcommerce',
        '2264': 'opco-sante',
        '2609': 'constructys',
        '2941': 'uniformation',
        '3043': 'akto',
        '3248': 'opco-2i',
      },
    },
  ],
};

/** Stages en formation initiale (RG-03-23). Gratification : montant horaire minimal en centimes. */
export interface ReglesStage {
  /** Au-delà de cette durée de présence (heures) sur une année d'enseignement, gratification obligatoire. */
  seuilGratificationHeures: number;
  /** Durée maximale par organisme d'accueil et par année d'enseignement, en mois. */
  dureeMaximaleMois: number;
}

export const reglesStage: DatedTable<ReglesStage> = {
  code: 'regles-stage',
  libelle: 'Stages : seuil de gratification et durée maximale',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2014-12-01',
      fin: null,
      source:
        'Code de l’éducation, articles L124-5 (six mois par organisme et par année d’enseignement), L124-6 et D124-6 (gratification au-delà de deux mois, soit 44 jours de 7 heures : 308 heures)',
      valeur: { seuilGratificationHeures: 308, dureeMaximaleMois: 6 },
    },
  ],
};

/** Gratification horaire minimale des stages, en centimes (15 % du plafond horaire de la sécurité sociale). */
export const gratificationMinimale: DatedTable<number> = {
  code: 'gratification-minimale',
  libelle: 'Gratification minimale des stages (centimes par heure)',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2024-01-01',
      fin: '2025-01-01',
      source: 'Code de l’éducation, D124-8 ; plafond horaire de la sécurité sociale 2024',
      valeur: 435,
    },
    {
      cle: 'defaut',
      debut: '2025-01-01',
      fin: null,
      source: 'Code de l’éducation, D124-8 ; plafond horaire de la sécurité sociale 2025',
      valeur: 450,
    },
  ],
};

/** Apprentissage : règles du Code du travail utilisées par le suivi des contrats. */
export interface ReglesApprentissage {
  /** RG-03-04 : apprentis par maître d'apprentissage, plus un apprenti dont la formation est prolongée. */
  apprentisParMaitre: number;
  apprentisSupplementairesProlonges: number;
  /** RG-03-08 : période d'essai, en jours de présence en entreprise. */
  periodeEssaiJours: number;
  /** RG-03-07 : poursuite de la formation sans employeur après une rupture, en mois. */
  sansEmployeurMois: number;
}

export const reglesApprentissage: DatedTable<ReglesApprentissage> = {
  code: 'regles-apprentissage',
  libelle: 'Apprentissage : maître d’apprentissage, période d’essai, apprenti sans employeur',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2019-01-01',
      fin: null,
      source:
        'Code du travail, articles R6223-6 (deux apprentis et un apprenti prolongé par maître), L6222-18 (45 jours de formation pratique en entreprise) et L6222-18-2 (six mois sans employeur)',
      valeur: {
        apprentisParMaitre: 2,
        apprentisSupplementairesProlonges: 1,
        periodeEssaiJours: 45,
        sansEmployeurMois: 6,
      },
    },
  ],
};
