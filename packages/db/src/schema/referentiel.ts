import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { etablissement } from './structure.js';

/**
 * Référentiel pédagogique (module 02, section 6) : formations, versions de maquette, blocs, UE,
 * modules, compétences, échelle de maîtrise et règles de notes particulières. Les règles de calcul
 * vivent dans packages/domain ; les colonnes jsonb en gardent les paramètres, validés par les
 * contrats Zod.
 */
export const formationType = pgEnum('formation_type', [
  'bts',
  'bachelor',
  'master',
  'titre_rncp',
  'cqp',
  'autre',
]);
export const formationMode = pgEnum('formation_mode', [
  'initial',
  'apprentissage',
  'professionnalisation',
  'formation_continue',
]);
export const formationStatut = pgEnum('formation_statut', ['active', 'archivee']);
export const versionStatut = pgEnum('maquette_version_statut', [
  'brouillon',
  'publiee',
  'archivee',
]);

/** Volumes et coefficients : deux décimales (heures, ECTS), trois pour les coefficients. */
const heures = () => numeric({ precision: 7, scale: 2, mode: 'number' }).notNull().default(0);
const coefficient = () => numeric({ precision: 7, scale: 3, mode: 'number' }).notNull().default(1);

/** Formation (US-02-01, RG-02-01). */
export const formation = pgTable(
  'formation',
  {
    ...organisationScoped(),
    intitule: text().notNull(),
    type: formationType().notNull(),
    niveau: smallint().notNull(),
    /** Code RNCP ou RS facultatif (ex. RNCP35521, RS5432). */
    codeRncp: text(),
    dureeAnnees: smallint().notNull(),
    modes: formationMode().array().notNull(),
    statut: formationStatut().notNull().default('active'),
    /** Formation dont celle-ci est la copie (US-02-04), tracée. */
    dupliqueDe: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('formation', t),
    check('formation_niveau_check', sql`${t.niveau} between 5 and 8`),
    check('formation_duree_check', sql`${t.dureeAnnees} between 1 and 8`),
    check('formation_modes_check', sql`cardinality(${t.modes}) > 0`),
  ],
).enableRLS();

/** Établissements où la formation est dispensée (RG-02-01). */
export const formationEtablissement = pgTable(
  'formation_etablissement',
  {
    ...organisationScoped(),
    formationId: uuid().notNull(),
    etablissementId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('formation_etablissement', t),
    uniqueIndex('formation_etablissement_paire_key').on(
      t.organisationId,
      t.formationId,
      t.etablissementId,
    ),
    index('formation_etablissement_etablissement_idx').on(t.organisationId, t.etablissementId),
    foreignKey({
      name: 'formation_etablissement_formation_fk',
      columns: [t.organisationId, t.formationId],
      foreignColumns: [formation.organisationId, formation.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'formation_etablissement_etablissement_fk',
      columns: [t.organisationId, t.etablissementId],
      foreignColumns: [etablissement.organisationId, etablissement.id],
    }),
  ],
).enableRLS();

/**
 * Version de maquette (RG-02-04, RG-02-09) : ses règles de validation (RG-02-07, RG-02-08,
 * RG-02-24, RG-02-25) sont gardées en jsonb, au format de ReglesValidation (packages/domain).
 */
export const maquetteVersion = pgTable(
  'maquette_version',
  {
    ...organisationScoped(),
    formationId: uuid().notNull(),
    numero: smallint().notNull(),
    statut: versionStatut().notNull().default('brouillon'),
    regles: jsonb().notNull(),
    /** Règlement des études en PDF (RG-02-09), dans le stockage objet. */
    reglementCle: text(),
    publieeLe: timestamp({ withTimezone: true }),
    /** Version reprise pour créer celle-ci (nouvelle version ou duplication). */
    versionSourceId: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('maquette_version', t),
    uniqueIndex('maquette_version_numero_key').on(t.organisationId, t.formationId, t.numero),
    foreignKey({
      name: 'maquette_version_formation_fk',
      columns: [t.organisationId, t.formationId],
      foreignColumns: [formation.organisationId, formation.id],
    }),
  ],
).enableRLS();

const versionFk = (name: string, t: { organisationId: AnyPgColumn; versionId: AnyPgColumn }) =>
  foreignKey({
    name: `${name}_version_fk`,
    columns: [t.organisationId, t.versionId],
    foreignColumns: [maquetteVersion.organisationId, maquetteVersion.id],
  }).onDelete('cascade');

/** Bloc de compétences (RG-02-02), facultatif. */
export const maquetteBloc = pgTable(
  'maquette_bloc',
  {
    ...organisationScoped(),
    versionId: uuid().notNull(),
    code: text().notNull(),
    intitule: text().notNull(),
    ordre: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('maquette_bloc', t),
    index('maquette_bloc_version_idx').on(t.organisationId, t.versionId),
    versionFk('maquette_bloc', t),
  ],
).enableRLS();

/** UE (RG-02-02, RG-02-06, RG-02-15). */
export const maquetteUe = pgTable(
  'maquette_ue',
  {
    ...organisationScoped(),
    versionId: uuid().notNull(),
    blocId: uuid(),
    code: text().notNull(),
    intitule: text().notNull(),
    annee: smallint().notNull().default(1),
    /** Semestre dans l'année (1 ou 2) ; null pour une UE annuelle. */
    semestre: smallint(),
    ects: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    coefficient: coefficient(),
    option: text(),
    ordre: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('maquette_ue', t),
    index('maquette_ue_version_idx').on(t.organisationId, t.versionId),
    versionFk('maquette_ue', t),
    foreignKey({
      name: 'maquette_ue_bloc_fk',
      columns: [t.organisationId, t.blocId],
      foreignColumns: [maquetteBloc.organisationId, maquetteBloc.id],
    }),
    check('maquette_ue_semestre_check', sql`${t.semestre} is null or ${t.semestre} in (1, 2)`),
    check('maquette_ue_valeurs_check', sql`${t.ects} >= 0 and ${t.coefficient} >= 0`),
  ],
).enableRLS();

/** Module (RG-02-02) : coefficient et volumes horaires par type. */
export const maquetteModule = pgTable(
  'maquette_module',
  {
    ...organisationScoped(),
    versionId: uuid().notNull(),
    ueId: uuid().notNull(),
    code: text().notNull(),
    intitule: text().notNull(),
    coefficient: coefficient(),
    heuresCm: heures(),
    heuresTd: heures(),
    heuresTp: heures(),
    heuresProjet: heures(),
    heuresElearning: heures(),
    ordre: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('maquette_module', t),
    index('maquette_module_version_idx').on(t.organisationId, t.versionId),
    versionFk('maquette_module', t),
    foreignKey({
      name: 'maquette_module_ue_fk',
      columns: [t.organisationId, t.ueId],
      foreignColumns: [maquetteUe.organisationId, maquetteUe.id],
    }),
    check(
      'maquette_module_valeurs_check',
      sql`${t.coefficient} >= 0 and ${t.heuresCm} >= 0 and ${t.heuresTd} >= 0 and ${t.heuresTp} >= 0 and ${t.heuresProjet} >= 0 and ${t.heuresElearning} >= 0`,
    ),
  ],
).enableRLS();

/** Compétence d'un bloc (RG-02-21), avec ses critères d'évaluation. */
export const competence = pgTable(
  'competence',
  {
    ...organisationScoped(),
    versionId: uuid().notNull(),
    blocId: uuid().notNull(),
    code: text().notNull(),
    intitule: text().notNull(),
    criteres: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ordre: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('competence', t),
    index('competence_version_idx').on(t.organisationId, t.versionId),
    versionFk('competence', t),
    foreignKey({
      name: 'competence_bloc_fk',
      columns: [t.organisationId, t.blocId],
      foreignColumns: [maquetteBloc.organisationId, maquetteBloc.id],
    }),
  ],
).enableRLS();

/** Rattachement d'une compétence à des modules (RG-02-23). */
export const competenceModule = pgTable(
  'competence_module',
  {
    ...organisationScoped(),
    competenceId: uuid().notNull(),
    moduleId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('competence_module', t),
    uniqueIndex('competence_module_paire_key').on(t.organisationId, t.competenceId, t.moduleId),
    index('competence_module_module_idx').on(t.organisationId, t.moduleId),
    foreignKey({
      name: 'competence_module_competence_fk',
      columns: [t.organisationId, t.competenceId],
      foreignColumns: [competence.organisationId, competence.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'competence_module_module_fk',
      columns: [t.organisationId, t.moduleId],
      foreignColumns: [maquetteModule.organisationId, maquetteModule.id],
    }).onDelete('cascade'),
  ],
).enableRLS();

/** Échelle de maîtrise de l'école (RG-02-22). */
export const niveauMaitrise = pgTable(
  'niveau_maitrise',
  {
    ...organisationScoped(),
    libelle: text().notNull(),
    couleur: char({ length: 7 }).notNull(),
    valeur: numeric({ precision: 5, scale: 2, mode: 'number' }),
    ordre: smallint().notNull(),
    /** Le niveau valide la compétence (« acquis » ou plus, RG-02-24). */
    valide: boolean().notNull().default(false),
    ...trackingColumns(),
  },
  (t) => [...organisationConstraints('niveau_maitrise', t)],
).enableRLS();

export const regleParticuliereType = pgEnum('regle_particuliere_type', [
  'bonus',
  'ue_bonus',
  'points_jury',
  'plafond',
  'ponderation',
  'penalite_absence',
]);

/** Bibliothèque de règles particulières de l'école (RG-02-26). */
export const regleParticuliere = pgTable(
  'regle_particuliere',
  {
    ...organisationScoped(),
    libelle: text().notNull(),
    type: regleParticuliereType().notNull(),
    /** Paramètres par défaut, au format RegleParticuliere (packages/domain). */
    parametres: jsonb().notNull(),
    ...trackingColumns(),
  },
  (t) => [...organisationConstraints('regle_particuliere', t)],
).enableRLS();

/**
 * Règle activée dans une version (RG-02-26, RG-02-28) : libellé et paramètres sont copiés à
 * l'activation, éventuellement surchargés, et ne suivent plus la bibliothèque.
 */
export const maquetteVersionRegle = pgTable(
  'maquette_version_regle',
  {
    ...organisationScoped(),
    versionId: uuid().notNull(),
    regleId: uuid(),
    libelle: text().notNull(),
    type: regleParticuliereType().notNull(),
    parametres: jsonb().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('maquette_version_regle', t),
    index('maquette_version_regle_version_idx').on(t.organisationId, t.versionId),
    versionFk('maquette_version_regle', t),
    foreignKey({
      name: 'maquette_version_regle_regle_fk',
      columns: [t.organisationId, t.regleId],
      foreignColumns: [regleParticuliere.organisationId, regleParticuliere.id],
    }),
  ],
).enableRLS();
