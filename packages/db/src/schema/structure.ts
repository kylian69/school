import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';

export const etablissementStatut = pgEnum('etablissement_statut', ['actif', 'archive']);
export const anneeScolaireStatut = pgEnum('annee_scolaire_statut', [
  'preparation',
  'en_cours',
  'cloturee',
]);

/** Établissement (US-01-02, RG-01-01, RG-01-02). */
export const etablissement = pgTable(
  'etablissement',
  {
    ...organisationScoped(),
    nom: text().notNull(),
    adresseLigne1: text(),
    adresseLigne2: text(),
    codePostal: text(),
    ville: text(),
    uai: char({ length: 8 }),
    siret: char({ length: 14 }),
    nda: char({ length: 11 }),
    fuseauHoraire: text().notNull().default('Europe/Paris'),
    telephone: text(),
    email: text(),
    statut: etablissementStatut().notNull().default('actif'),
    /** RG-04-02 : plage horaire de l'emploi du temps, en heures locales (pas de 15 minutes). */
    edtDebut: time().notNull().default('08:00'),
    edtFin: time().notNull().default('19:00'),
    /** RG-04-02 : limite matin / après-midi (demi-journées d'assiduité, RG-06-18). */
    edtLimiteMidi: time().notNull().default('13:00'),
    /** RG-04-02 : jours ouvrés de la grille, ISO (lundi = 1 … dimanche = 7). */
    edtJoursOuvres: smallint()
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'::smallint[]`),
    /**
     * RG-06-09, RG-06-10 : contrôle de localisation à l'émargement (actif par défaut) et
     * périmètre du site : centre (degrés décimaux), rayon en mètres, plages d'adresses IP du
     * réseau du campus (CIDR). Sans coordonnées ni plage, rien n'est contrôlé.
     */
    localisationActive: boolean().notNull().default(true),
    localisationLatitude: doublePrecision(),
    localisationLongitude: doublePrecision(),
    localisationRayon: integer().notNull().default(300),
    localisationPlagesIp: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('etablissement', t),
    check(
      'etablissement_localisation_check',
      sql`(${t.localisationLatitude} is null) = (${t.localisationLongitude} is null) AND ${t.localisationLatitude} between -90 and 90 AND ${t.localisationLongitude} between -180 and 180 AND ${t.localisationRayon} between 50 and 5000`,
    ),
    check('etablissement_edt_plage_check', sql`${t.edtFin} > ${t.edtDebut}`),
    check(
      'etablissement_edt_limite_check',
      sql`${t.edtLimiteMidi} > ${t.edtDebut} AND ${t.edtLimiteMidi} < ${t.edtFin}`,
    ),
    check(
      'etablissement_edt_jours_check',
      sql`cardinality(${t.edtJoursOuvres}) >= 1 AND ${t.edtJoursOuvres} <@ '{1,2,3,4,5,6,7}'::smallint[]`,
    ),
  ],
).enableRLS();

/** Année scolaire (US-01-03, RG-01-03, RG-00-05). */
export const anneeScolaire = pgTable(
  'annee_scolaire',
  {
    ...organisationScoped(),
    libelle: text().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    statut: anneeScolaireStatut().notNull().default('preparation'),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('annee_scolaire', t),
    check('annee_scolaire_dates_check', sql`${t.dateFin} > ${t.dateDebut}`),
  ],
).enableRLS();

/** Période d'une année scolaire (RG-01-03). Le non-chevauchement est vérifié par le domaine. */
export const periode = pgTable(
  'periode',
  {
    ...organisationScoped(),
    anneeScolaireId: uuid().notNull(),
    libelle: text().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    ordre: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('periode', t),
    foreignKey({
      name: 'periode_annee_scolaire_fk',
      columns: [t.organisationId, t.anneeScolaireId],
      foreignColumns: [anneeScolaire.organisationId, anneeScolaire.id],
    }),
    check('periode_dates_check', sql`${t.dateFin} >= ${t.dateDebut}`),
  ],
).enableRLS();

export const fermetureType = pgEnum('fermeture_type', ['ferie', 'vacances', 'autre']);

/**
 * Fermeture d'une année scolaire : vacances, pont, jour férié local (RG-01-04). Elle s'applique aux
 * établissements listés dans fermeture_etablissement, ou à tous s'il n'y en a aucun.
 */
export const fermeture = pgTable(
  'fermeture',
  {
    ...organisationScoped(),
    anneeScolaireId: uuid().notNull(),
    libelle: text().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    type: fermetureType().notNull().default('vacances'),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('fermeture', t),
    index('fermeture_organisation_id_annee_scolaire_id_idx').on(
      t.organisationId,
      t.anneeScolaireId,
    ),
    foreignKey({
      name: 'fermeture_annee_scolaire_fk',
      columns: [t.organisationId, t.anneeScolaireId],
      foreignColumns: [anneeScolaire.organisationId, anneeScolaire.id],
    }),
    check('fermeture_dates_check', sql`${t.dateFin} >= ${t.dateDebut}`),
  ],
).enableRLS();

/** Établissements concernés par une fermeture. */
export const fermetureEtablissement = pgTable(
  'fermeture_etablissement',
  {
    ...organisationScoped(),
    fermetureId: uuid().notNull(),
    etablissementId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('fermeture_etablissement', t),
    uniqueIndex('fermeture_etablissement_paire_key').on(
      t.organisationId,
      t.fermetureId,
      t.etablissementId,
    ),
    foreignKey({
      name: 'fermeture_etablissement_fermeture_fk',
      columns: [t.organisationId, t.fermetureId],
      foreignColumns: [fermeture.organisationId, fermeture.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fermeture_etablissement_etablissement_fk',
      columns: [t.organisationId, t.etablissementId],
      foreignColumns: [etablissement.organisationId, etablissement.id],
    }),
  ],
).enableRLS();

export const choixEtapeDemarrage = pgEnum('choix_etape_demarrage', ['faite', 'sautee']);

/**
 * Étape de la liste de démarrage marquée faite ou passée par l'administrateur (US-01-01). Une
 * étape sans ligne suit les données de l'école ; « reprendre » supprime la ligne.
 */
export const demarrageEtape = pgTable(
  'demarrage_etape',
  {
    ...organisationScoped(),
    etape: text().notNull(),
    choix: choixEtapeDemarrage().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('demarrage_etape', t),
    uniqueIndex('demarrage_etape_organisation_id_etape_key').on(t.organisationId, t.etape),
  ],
).enableRLS();
