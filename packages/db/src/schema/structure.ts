import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  pgEnum,
  pgTable,
  smallint,
  text,
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
    ...trackingColumns(),
  },
  (t) => organisationConstraints('etablissement', t),
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
