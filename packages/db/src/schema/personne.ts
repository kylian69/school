import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';

/**
 * Personne (module 01, section 6). Les autres attributs (naissance, matricule, INE, photo…)
 * arrivent avec l'incrément I1.4, chacun justifié par sa story (minimisation, RGPD).
 */
export const personne = pgTable(
  'personne',
  {
    ...organisationScoped(),
    nom: text().notNull(),
    nomUsage: text(),
    prenom: text().notNull(),
    email: text().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('personne', t),
    // RG-01-06 : une personne est identifiée de façon unique par son email dans l'organisation.
    uniqueIndex('personne_organisation_id_email_key')
      .on(t.organisationId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null`),
  ],
).enableRLS();
