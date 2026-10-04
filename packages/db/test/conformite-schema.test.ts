import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_ROLE } from '../src/roles.js';
import {
  PLATFORM_READONLY_TABLES,
  PLATFORM_TABLES,
  SELF_SCOPED_TABLES,
} from '../src/schema/index.js';
import { openOwner } from './fixtures.js';

/**
 * Contrôle du schéma réellement migré (plan de développement, section 6) : bloque une table sans
 * organisation_id ni politique RLS, et un index qui ne commence pas par organisation_id.
 */
describe('Conformité du schéma', async () => {
  const owner = openOwner();
  const tables = (
    await owner.db.execute<{
      table_name: string;
      rls: boolean;
      has_org: boolean;
      app_policies: number;
    }>(sql`
      select c.relname as table_name,
             c.relrowsecurity as rls,
             exists (select 1 from pg_attribute a
                     where a.attrelid = c.oid and a.attname = 'organisation_id'
                       and a.attnotnull and not a.attisdropped) as has_org,
             (select count(*)::int from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and ${APP_ROLE} = any (p.roles)) as app_policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
      order by c.relname`)
  ).rows;
  const scoped = tables.filter(
    (t) => !PLATFORM_TABLES.includes(t.table_name) && !SELF_SCOPED_TABLES.includes(t.table_name),
  );

  afterAll(async () => {
    await owner.close();
  });

  it('les tables de plateforme et auto-cloisonnées listées existent toutes', () => {
    const names = tables.map((t) => t.table_name);
    for (const table of [...PLATFORM_TABLES, ...SELF_SCOPED_TABLES]) {
      expect(names).toContain(table);
    }
  });

  it.each(scoped.map((t) => [t.table_name, t] as const))(
    '%s porte organisation_id NOT NULL, RLS active et une politique pour le rôle applicatif',
    (_name, table) => {
      expect(table.has_org).toBe(true);
      expect(table.rls).toBe(true);
      expect(table.app_policies).toBeGreaterThan(0);
    },
  );

  it.each(SELF_SCOPED_TABLES)('%s a la RLS active et une politique', (name) => {
    const table = tables.find((t) => t.table_name === name);
    expect(table?.rls).toBe(true);
    expect(table?.app_policies).toBeGreaterThan(0);
  });

  it("tout index d'une table cloisonnée commence par organisation_id (hors clé primaire)", async () => {
    const indexes = await owner.db.execute<{
      table_name: string;
      index_name: string;
      first: string;
    }>(sql`
      select t.relname as table_name, i.relname as index_name, a.attname as first
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      left join pg_attribute a on a.attrelid = t.oid and a.attnum = x.indkey[0]
      where n.nspname = 'public' and not x.indisprimary and not t.relispartition`);
    const scopedNames = new Set(scoped.map((t) => t.table_name));
    const offending = indexes.rows
      .filter((r) => scopedNames.has(r.table_name) && r.first !== 'organisation_id')
      .map((r) => `${r.table_name}.${r.index_name}`);
    expect(offending).toEqual([]);
  });

  it("le rôle applicatif n'a aucun droit direct sur les partitions (accès par la table parente)", async () => {
    const grants = await owner.db.execute<{ partition: string }>(sql`
      select c.relname as partition
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relispartition
        and has_table_privilege(${APP_ROLE}, c.oid, 'SELECT, INSERT, UPDATE, DELETE')`);
    expect(grants.rows).toEqual([]);
  });

  it("le rôle applicatif n'a aucun droit d'écriture sur les tables de plateforme en lecture seule", async () => {
    const grants = await owner.db.execute<{ table_name: string; privilege_type: string }>(sql`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = ${APP_ROLE} and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')`);
    const onPlatform = grants.rows.filter((g) => PLATFORM_READONLY_TABLES.includes(g.table_name));
    expect(onPlatform).toEqual([]);
  });
});
