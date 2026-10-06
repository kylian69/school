import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { authUser } from './auth.js';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';

/**
 * Personne (module 01, section 6). Les autres attributs (naissance, matricule, INE, photo…)
 * arrivent avec l'incrément I1.4, chacun justifié par sa story (minimisation, RGPD).
 */
export const compteEtat = pgEnum('compte_etat', ['cree', 'invite', 'actif', 'desactive']);

export const personne = pgTable(
  'personne',
  {
    ...organisationScoped(),
    nom: text().notNull(),
    nomUsage: text(),
    prenom: text().notNull(),
    email: text().notNull(),
    /**
     * Compte de connexion (RG-00-26 : un seul compte pour les fiches d'une même personne dans les
     * écoles d'un groupe). Null tant que la personne n'a pas activé son compte.
     */
    userId: uuid().references(() => authUser.id),
    /** Cycle de vie du compte dans cette école (RG-01-08). */
    compteEtat: compteEtat().notNull().default('cree'),
    /** Acceptation des conditions d'utilisation à l'activation (parcours d'activation). */
    conditionsAccepteesLe: timestamp({ withTimezone: true }),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('personne', t),
    // RG-01-06 : une personne est identifiée de façon unique par son email dans l'organisation.
    uniqueIndex('personne_organisation_id_email_key')
      .on(t.organisationId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('personne_organisation_id_user_id_key')
      .on(t.organisationId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
).enableRLS();
