import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { newId } from '../ids.js';
import { platformRole } from '../roles.js';
import { authUser } from './auth.js';
import { primaryId, trackingColumns } from './columns.js';
import {
  groupe,
  organisation,
  organisationConstraints,
  organisationScoped,
} from './organisation.js';

/**
 * Tables de la console de la plateforme (module 19, ADR 0004). Tables privées : aucun droit pour
 * le rôle applicatif ; droits du rôle plateforme accordés dans la migration.
 */
export const formuleEnum = pgEnum('formule', ['essentiel', 'pro', 'entreprise']);
export const clientEtat = pgEnum('client_etat', ['actif', 'suspendu', 'resilie', 'supprime']);
export const clientMode = pgEnum('client_mode', ['saas', 'auto_heberge']);
export const plateformeRole = pgEnum('plateforme_role', ['super_administrateur', 'support']);
export const moduleOrigine = pgEnum('module_origine', ['formule', 'exception']);

/** Client : un groupe d'écoles ou une organisation seule (RG-19-01). */
export const client = pgTable(
  'client',
  {
    id: primaryId(),
    groupeId: uuid().references(() => groupe.id),
    organisationId: uuid().references(() => organisation.id),
    raisonSociale: text().notNull(),
    siren: text(),
    sousDomaine: text().notNull().unique(),
    mode: clientMode().notNull().default('saas'),
    etat: clientEtat().notNull().default('actif'),
    contactFacturationNom: text(),
    contactFacturationEmail: text(),
    /** Administrateur à inviter à la création (l'invitation part avec I1.2). */
    administrateurNom: text().notNull(),
    administrateurEmail: text().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    check(
      'client_porte_un_groupe_ou_une_organisation',
      sql`num_nonnulls(${t.groupeId}, ${t.organisationId}) = 1`,
    ),
  ],
);

/** Contrat d'un client (formule, volume, dates). La tarification arrive avec US-19-03. */
export const contrat = pgTable(
  'contrat',
  {
    id: primaryId(),
    clientId: uuid()
      .notNull()
      .references(() => client.id),
    formule: formuleEnum().notNull(),
    volumeApprenants: integer().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    referenceDevis: text(),
    ...trackingColumns(),
  },
  (t) => [
    check('contrat_volume_positif', sql`${t.volumeApprenants} > 0`),
    check('contrat_dates', sql`${t.dateFin} > ${t.dateDebut}`),
  ],
);

/** Historique des états d'un client (RG-19-02 : motif obligatoire, tracé), en ajout seul. */
export const clientEtatEvenement = pgTable('client_etat_evenement', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => newId()),
  clientId: uuid()
    .notNull()
    .references(() => client.id),
  etatPrecedent: clientEtat(),
  etat: clientEtat().notNull(),
  motif: text().notNull(),
  auteurId: uuid().references(() => authUser.id),
  survenuLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Membres de l'équipe Scolaly qui accèdent à la console (super-administrateur, support). */
export const plateformeMembre = pgTable('plateforme_membre', {
  id: primaryId(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  role: plateformeRole().notNull(),
  ...trackingColumns(),
});

/** Journal d'audit de la console, propre à Scolaly, conservé 3 ans (module 19), en ajout seul. */
export const plateformeAudit = pgTable('plateforme_audit', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => newId()),
  survenuLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  auteurId: uuid(),
  adresseIp: inet(),
  action: text().notNull(),
  objetType: text().notNull(),
  objetId: uuid(),
  avant: jsonb(),
  apres: jsonb(),
});

/**
 * Modules d'une école (RG-19-04) : origine (formule ou exception) et état. L'école lit les siens
 * sous RLS ; la console les gère pour toutes les écoles.
 */
export const organisationModule = pgTable(
  'organisation_module',
  {
    ...organisationScoped(),
    module: text().notNull(),
    actif: boolean().notNull(),
    origine: moduleOrigine().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('organisation_module', t),
    uniqueIndex('organisation_module_organisation_id_module_key').on(t.organisationId, t.module),
    pgPolicy('organisation_module_plateforme', {
      as: 'permissive',
      for: 'all',
      to: platformRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
