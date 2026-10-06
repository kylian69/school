import { sql } from 'drizzle-orm';
import { inet, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { newId } from '../ids.js';

/**
 * Tables créées en SQL (migration 0003), hors de Drizzle Kit, qui ne sait pas gérer le
 * partitionnement ni les fonctions SECURITY DEFINER. Ces définitions servent au typage des requêtes.
 * L'organisation prend par défaut celle de la transaction (withOrganisation).
 */

/** Journal d'audit en ajout seul, partitionné par mois (RG-01-22, architecture section 3). */
export const auditEvenement = pgTable('audit_evenement', {
  id: uuid()
    .notNull()
    .$defaultFn(() => newId()),
  organisationId: uuid()
    .notNull()
    .default(sql`app_current_organisation_id()`),
  survenuLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  auteurId: uuid(),
  adresseIp: inet(),
  action: text().notNull(),
  objetType: text().notNull(),
  objetId: uuid(),
  avant: jsonb(),
  apres: jsonb(),
});

/** Boîte d'envoi des événements internes (architecture section 2 : une seule source). */
export const outboxEvenement = pgTable('outbox_evenement', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => newId()),
  organisationId: uuid()
    .notNull()
    .default(sql`app_current_organisation_id()`),
  type: text().notNull(),
  charge: jsonb().notNull(),
  survenuLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  publieLe: timestamp({ withTimezone: true }),
  tentatives: integer().notNull().default(0),
  derniereErreur: text(),
});
