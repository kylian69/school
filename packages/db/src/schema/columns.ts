import { sql } from 'drizzle-orm';
import { check, pgPolicy, smallint, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
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

/**
 * RG-06-23 : seuils d'alerte d'assiduité (demi-journées non justifiées sur une période glissante),
 * de l'école ou d'une formation ; tous null : seuils hérités (domaine, seuilsApplicables).
 */
export const seuilsAssiduiteColumns = () => ({
  assiduiteSeuilNiveau1: smallint(),
  assiduiteSeuilNiveau2: smallint(),
  assiduiteFenetreJours: smallint(),
});

/** Les trois valeurs ensemble, dans les bornes du domaine (BORNES_SEUILS_ASSIDUITE). */
export function seuilsAssiduiteCheck(
  table: string,
  t: {
    assiduiteSeuilNiveau1: AnyPgColumn;
    assiduiteSeuilNiveau2: AnyPgColumn;
    assiduiteFenetreJours: AnyPgColumn;
  },
) {
  return check(
    `${table}_seuils_assiduite_check`,
    sql`(${t.assiduiteSeuilNiveau1} is null and ${t.assiduiteSeuilNiveau2} is null and ${t.assiduiteFenetreJours} is null) or (${t.assiduiteSeuilNiveau1} between 1 and 100 and ${t.assiduiteSeuilNiveau2} between 1 and 100 and ${t.assiduiteSeuilNiveau1} < ${t.assiduiteSeuilNiveau2} and ${t.assiduiteFenetreJours} between 7 and 365)`,
  );
}

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
