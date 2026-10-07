import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';
import { formation, maquetteModule, maquetteVersion } from './referentiel.js';
import { anneeScolaire, etablissement } from './structure.js';

/**
 * Scolarité (module 02, section 6 ; architecture, section 3) : promotions, groupes, inscriptions,
 * statuts et appartenance aux groupes. Les périodes ont une fin exclue (null : en cours).
 */

/** Promotion = formation × année de formation × année scolaire × établissement (RG-02-12). */
export const promotion = pgTable(
  'promotion',
  {
    ...organisationScoped(),
    formationId: uuid().notNull(),
    /** RG-02-05 : version de maquette suivie par la promotion. */
    versionId: uuid().notNull(),
    anneeFormation: smallint().notNull(),
    anneeScolaireId: uuid().notNull(),
    etablissementId: uuid().notNull(),
    libelle: text().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    /** Promotion reconduite d'une année à l'autre (RG-02-20). */
    reconduiteDe: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('promotion', t),
    uniqueIndex('promotion_unique_key')
      .on(t.organisationId, t.formationId, t.anneeFormation, t.anneeScolaireId, t.etablissementId)
      .where(sql`${t.deletedAt} is null`),
    index('promotion_annee_idx').on(t.organisationId, t.anneeScolaireId),
    index('promotion_version_idx').on(t.organisationId, t.versionId),
    foreignKey({
      name: 'promotion_formation_fk',
      columns: [t.organisationId, t.formationId],
      foreignColumns: [formation.organisationId, formation.id],
    }),
    foreignKey({
      name: 'promotion_version_fk',
      columns: [t.organisationId, t.versionId],
      foreignColumns: [maquetteVersion.organisationId, maquetteVersion.id],
    }),
    foreignKey({
      name: 'promotion_annee_fk',
      columns: [t.organisationId, t.anneeScolaireId],
      foreignColumns: [anneeScolaire.organisationId, anneeScolaire.id],
    }),
    foreignKey({
      name: 'promotion_etablissement_fk',
      columns: [t.organisationId, t.etablissementId],
      foreignColumns: [etablissement.organisationId, etablissement.id],
    }),
    check('promotion_dates_check', sql`${t.dateFin} > ${t.dateDebut}`),
    check('promotion_annee_formation_check', sql`${t.anneeFormation} between 1 and 8`),
  ],
).enableRLS();

export const groupeType = pgEnum('groupe_type', ['td', 'tp', 'option', 'langue', 'autre']);

/** Groupe (RG-02-14) : d'une promotion, ou de plusieurs s'il est transversal (US-02-12). */
export const groupeEleves = pgTable(
  'groupe_eleves',
  {
    ...organisationScoped(),
    libelle: text().notNull(),
    type: groupeType().notNull(),
    capacite: integer(),
    /** RG-02-15 : pour un groupe d'option, l'option de la maquette qu'il suit. */
    option: text(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('groupe_eleves', t),
    check('groupe_eleves_capacite_check', sql`${t.capacite} is null or ${t.capacite} > 0`),
  ],
).enableRLS();

/** Promotions d'un groupe ; plusieurs pour un groupe transversal. */
export const groupePromotion = pgTable(
  'groupe_promotion',
  {
    ...organisationScoped(),
    groupeId: uuid().notNull(),
    promotionId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('groupe_promotion', t),
    uniqueIndex('groupe_promotion_paire_key').on(t.organisationId, t.groupeId, t.promotionId),
    index('groupe_promotion_promotion_idx').on(t.organisationId, t.promotionId),
    foreignKey({
      name: 'groupe_promotion_groupe_fk',
      columns: [t.organisationId, t.groupeId],
      foreignColumns: [groupeEleves.organisationId, groupeEleves.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'groupe_promotion_promotion_fk',
      columns: [t.organisationId, t.promotionId],
      foreignColumns: [promotion.organisationId, promotion.id],
    }),
  ],
).enableRLS();

export const inscriptionEtat = pgEnum('inscription_etat', [
  'preinscrit',
  'inscrit',
  'demissionnaire',
  'exclu',
  'diplome',
]);
export const statutApprenant = pgEnum('statut_apprenant', [
  'initial',
  'apprenti',
  'professionnalisation',
  'formation_continue',
]);

/** Inscription d'un apprenant à une promotion (RG-02-13, RG-02-17). */
export const inscription = pgTable(
  'inscription',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    promotionId: uuid().notNull(),
    etat: inscriptionEtat().notNull().default('inscrit'),
    dateEntree: date().notNull(),
    /** Fin exclue : l'apprenant quitte les listes d'appel ce jour-là. */
    dateSortie: date(),
    motifSortie: text(),
    /** RG-02-15 : option suivie. */
    option: text(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('inscription', t),
    uniqueIndex('inscription_unique_key')
      .on(t.organisationId, t.personneId, t.promotionId)
      .where(sql`${t.deletedAt} is null`),
    index('inscription_promotion_idx').on(t.organisationId, t.promotionId),
    foreignKey({
      name: 'inscription_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'inscription_promotion_fk',
      columns: [t.organisationId, t.promotionId],
      foreignColumns: [promotion.organisationId, promotion.id],
    }),
    check(
      'inscription_dates_check',
      sql`${t.dateSortie} is null or ${t.dateSortie} > ${t.dateEntree}`,
    ),
  ],
).enableRLS();

/** Périodes de statut d'une inscription (section 7 : initial → apprenti en cours d'année). */
export const inscriptionStatut = pgTable(
  'inscription_statut',
  {
    ...organisationScoped(),
    inscriptionId: uuid().notNull(),
    statut: statutApprenant().notNull(),
    debut: date().notNull(),
    fin: date(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('inscription_statut', t),
    index('inscription_statut_inscription_idx').on(t.organisationId, t.inscriptionId),
    foreignKey({
      name: 'inscription_statut_inscription_fk',
      columns: [t.organisationId, t.inscriptionId],
      foreignColumns: [inscription.organisationId, inscription.id],
    }).onDelete('cascade'),
    check('inscription_statut_dates_check', sql`${t.fin} is null or ${t.fin} > ${t.debut}`),
  ],
).enableRLS();

/** Appartenance d'une inscription à un groupe, sur une période (section 7 : changement de groupe). */
export const groupeMembre = pgTable(
  'groupe_membre',
  {
    ...organisationScoped(),
    groupeId: uuid().notNull(),
    inscriptionId: uuid().notNull(),
    debut: date().notNull(),
    fin: date(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('groupe_membre', t),
    index('groupe_membre_groupe_idx').on(t.organisationId, t.groupeId),
    index('groupe_membre_inscription_idx').on(t.organisationId, t.inscriptionId),
    foreignKey({
      name: 'groupe_membre_groupe_fk',
      columns: [t.organisationId, t.groupeId],
      foreignColumns: [groupeEleves.organisationId, groupeEleves.id],
    }),
    foreignKey({
      name: 'groupe_membre_inscription_fk',
      columns: [t.organisationId, t.inscriptionId],
      foreignColumns: [inscription.organisationId, inscription.id],
    }).onDelete('cascade'),
    check('groupe_membre_dates_check', sql`${t.fin} is null or ${t.fin} > ${t.debut}`),
  ],
).enableRLS();

export const salleType = pgEnum('salle_type', [
  'cours',
  'tp_informatique',
  'laboratoire',
  'amphitheatre',
  'virtuelle',
]);
export const salleStatut = pgEnum('salle_statut', ['disponible', 'fermee']);

/** Salle d'un établissement (RG-02-19) ; une salle virtuelle existe par défaut. */
export const salle = pgTable(
  'salle',
  {
    ...organisationScoped(),
    etablissementId: uuid().notNull(),
    nom: text().notNull(),
    capacite: integer(),
    type: salleType().notNull().default('cours'),
    equipements: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pmr: boolean().notNull().default(false),
    statut: salleStatut().notNull().default('disponible'),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('salle', t),
    index('salle_etablissement_idx').on(t.organisationId, t.etablissementId),
    foreignKey({
      name: 'salle_etablissement_fk',
      columns: [t.organisationId, t.etablissementId],
      foreignColumns: [etablissement.organisationId, etablissement.id],
    }),
    check('salle_capacite_check', sql`${t.capacite} is null or ${t.capacite} > 0`),
  ],
).enableRLS();

const heuresAffectees = () =>
  numeric({ precision: 7, scale: 2, mode: 'number' }).notNull().default(0);

/**
 * Affectation d'un intervenant à un module pour une promotion (RG-02-18), avec ses heures prévues
 * par type ; ses groupes sont dans affectation_groupe (aucun : toute la promotion).
 */
export const affectation = pgTable(
  'affectation',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    moduleId: uuid().notNull(),
    promotionId: uuid().notNull(),
    heuresCm: heuresAffectees(),
    heuresTd: heuresAffectees(),
    heuresTp: heuresAffectees(),
    heuresProjet: heuresAffectees(),
    heuresElearning: heuresAffectees(),
    /** Affectation reconduite d'une année à l'autre (RG-02-20). */
    reconduiteDe: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('affectation', t),
    index('affectation_promotion_idx').on(t.organisationId, t.promotionId),
    index('affectation_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'affectation_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'affectation_module_fk',
      columns: [t.organisationId, t.moduleId],
      foreignColumns: [maquetteModule.organisationId, maquetteModule.id],
    }),
    foreignKey({
      name: 'affectation_promotion_fk',
      columns: [t.organisationId, t.promotionId],
      foreignColumns: [promotion.organisationId, promotion.id],
    }),
  ],
).enableRLS();

export const affectationGroupe = pgTable(
  'affectation_groupe',
  {
    ...organisationScoped(),
    affectationId: uuid().notNull(),
    groupeId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('affectation_groupe', t),
    uniqueIndex('affectation_groupe_paire_key').on(t.organisationId, t.affectationId, t.groupeId),
    foreignKey({
      name: 'affectation_groupe_affectation_fk',
      columns: [t.organisationId, t.affectationId],
      foreignColumns: [affectation.organisationId, affectation.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'affectation_groupe_groupe_fk',
      columns: [t.organisationId, t.groupeId],
      foreignColumns: [groupeEleves.organisationId, groupeEleves.id],
    }),
  ],
).enableRLS();
