import { sql } from 'drizzle-orm';
import { pgPolicy, timestamp, uuid } from 'drizzle-orm/pg-core';
import { newId } from '../ids.js';
import { appRole } from '../roles.js';

export const primaryId = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => newId());

/** Colonnes de suivi et corbeille, présentes sur chaque table (conventions de données). */
export const trackingColumns = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid(),
  deletedAt: timestamp({ withTimezone: true }),
});

/** Politique RLS : le rôle applicatif ne voit et n'écrit que les lignes de l'organisation courante. */
export function isolationPolicy(table: string, column = 'organisation_id') {
  const condition = sql.raw(`${column} = app_current_organisation_id()`);
  return pgPolicy(`${table}_isolation`, {
    as: 'permissive',
    for: 'all',
    to: appRole,
    using: condition,
    withCheck: condition,
  });
}
