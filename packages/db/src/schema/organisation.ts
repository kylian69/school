import { sql } from 'drizzle-orm';
import { char, pgPolicy, pgTable, text, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { platformRole } from '../roles.js';
import { isolationPolicy, primaryId, trackingColumns } from './columns.js';

/**
 * Groupe d'écoles (RG-00-23) : table de plateforme, sans organisation_id (module 01, section 6).
 * Le rôle applicatif n'y a qu'un accès en lecture (ADR 0002).
 */
export const groupe = pgTable('groupe', {
  id: primaryId(),
  nom: text().notNull(),
  ...trackingColumns(),
});

/** Organisation (une école) : sa propre ligne est la seule visible pour la session. */
export const organisation = pgTable(
  'organisation',
  {
    id: primaryId(),
    groupeId: uuid().references(() => groupe.id),
    nom: text().notNull(),
    nomAffichage: text().notNull(),
    siren: char({ length: 9 }),
    ...trackingColumns(),
  },
  () => [
    isolationPolicy('organisation', 'id'),
    // Console de la plateforme (ADR 0004) : toutes les organisations, cette table seulement.
    pgPolicy('organisation_plateforme', {
      as: 'permissive',
      for: 'all',
      to: platformRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

/** Colonnes d'une table métier cloisonnée par organisation (RG-00-01). */
export const organisationScoped = () => ({
  id: primaryId(),
  organisationId: uuid()
    .notNull()
    .references(() => organisation.id),
});

/**
 * Contraintes d'une table cloisonnée : politique RLS, et contrainte unique (organisation_id, id)
 * qui permet aux tables enfants de référencer leur parent par une clé étrangère composite, donc
 * jamais dans une autre organisation.
 */
export function organisationConstraints(
  name: string,
  table: { organisationId: AnyPgColumn; id: AnyPgColumn },
) {
  return [
    unique(`${name}_organisation_id_id_key`).on(table.organisationId, table.id),
    isolationPolicy(name),
  ];
}
