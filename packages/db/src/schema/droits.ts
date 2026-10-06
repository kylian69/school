import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';

/**
 * Rôles, permissions et attributions (module 01, RG-01-14 à RG-01-16 ; RG-00-10 à RG-00-12).
 * Les 13 rôles par défaut portent un code et ne sont pas supprimables (RG-01-15) ; les rôles
 * personnalisés n'en ont pas.
 */
export const perimetreType = pgEnum('perimetre_type', [
  'organisation',
  'etablissement',
  'formation',
  'promotion',
  'soi',
]);

export const role = pgTable(
  'role',
  {
    ...organisationScoped(),
    /** Code d'un rôle par défaut (ex. « administrateur ») ; null pour un rôle personnalisé. */
    code: text(),
    libelle: text().notNull(),
    description: text(),
    perimetreParDefaut: perimetreType().notNull().default('organisation'),
    doubleAuthentificationRequise: boolean().notNull().default(false),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('role', t),
    uniqueIndex('role_organisation_id_code_key')
      .on(t.organisationId, t.code)
      .where(sql`${t.code} is not null`),
  ],
).enableRLS();

export const rolePermission = pgTable(
  'role_permission',
  {
    ...organisationScoped(),
    roleId: uuid().notNull(),
    permission: text().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('role_permission', t),
    uniqueIndex('role_permission_organisation_id_role_id_permission_key').on(
      t.organisationId,
      t.roleId,
      t.permission,
    ),
    foreignKey({
      name: 'role_permission_role_fk',
      columns: [t.organisationId, t.roleId],
      foreignColumns: [role.organisationId, role.id],
    }).onDelete('cascade'),
  ],
).enableRLS();

/** Une personne, un rôle, un périmètre, pour une période (fin exclue). */
export const attribution = pgTable(
  'attribution',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    roleId: uuid().notNull(),
    perimetreType: perimetreType().notNull(),
    /** Établissement, formation ou promotion ; null pour l'organisation ou soi-même. */
    perimetreId: uuid(),
    debut: date().notNull(),
    fin: date(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('attribution', t),
    index('attribution_organisation_id_personne_id_idx').on(t.organisationId, t.personneId),
    index('attribution_organisation_id_role_id_idx').on(t.organisationId, t.roleId),
    foreignKey({
      name: 'attribution_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'attribution_role_fk',
      columns: [t.organisationId, t.roleId],
      foreignColumns: [role.organisationId, role.id],
    }),
    check('attribution_dates', sql`${t.fin} is null or ${t.fin} > ${t.debut}`),
    check(
      'attribution_perimetre',
      sql`(${t.perimetreType} in ('organisation', 'soi')) = (${t.perimetreId} is null)`,
    ),
  ],
).enableRLS();
