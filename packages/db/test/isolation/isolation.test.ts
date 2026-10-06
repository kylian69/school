import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/client.js';
import { withOrganisation, type Transaction } from '../../src/organisation-context.js';
import { PLATFORM_TABLES, SELF_SCOPED_TABLES } from '../../src/schema/index.js';
import { createOrganisations, expectPgError, openApp, openOwner } from '../fixtures.js';
import { sampleRows } from './registry.js';

/**
 * SEC-03 / RG-00-01 : test d'isolation généré pour chaque table cloisonnée du schéma. Une
 * organisation ne lit, ne modifie ni ne supprime aucune ligne d'une autre, et ne peut pas en
 * écrire pour elle. La liste des tables est lue dans la base : aucune table ne peut y échapper.
 */
async function listScopedTables(db: Database): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(sql`
    select c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    order by c.relname`);
  const excluded = new Set([...PLATFORM_TABLES, ...SELF_SCOPED_TABLES]);
  return result.rows.map((r) => r.table_name).filter((t) => !excluded.has(t));
}

const organisationIds = async (tx: Transaction, query: ReturnType<typeof sql>) =>
  (await tx.execute<{ organisation_id: string }>(query)).rows.map((r) => r.organisation_id);

describe('SEC-03 isolation entre organisations, table par table', async () => {
  const owner = openOwner();
  const tables = await listScopedTables(owner.db);
  const app = openApp();
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    [orgA, orgB] = (await createOrganisations(2)) as [string, string];
    for (const table of tables) {
      const sample = sampleRows[table];
      if (!sample) continue;
      await sample.insert(owner.db, orgA);
      await sample.insert(owner.db, orgB);
    }
  });

  afterAll(async () => {
    await app.close();
    await owner.close();
  });

  it('au moins une table cloisonnée est vérifiée', () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  describe.each(tables)('%s', (table) => {
    const t = sql.identifier(table);

    it('a une entrée dans le registre des lignes d’exemple', () => {
      expect(sampleRows, `Ajouter "${table}" à test/isolation/registry.ts`).toHaveProperty(table);
    });

    it("ne lit que les lignes de l'organisation courante", async () => {
      const seen = await withOrganisation(app.db, orgA, (tx) =>
        organisationIds(tx, sql`select organisation_id from ${t}`),
      );
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set([orgA]));
    });

    const appAccess = sampleRows[table]?.appAccess ?? 'full';
    const appendOnly = appAccess !== 'full';

    it.runIf(appendOnly)(
      `n'accorde ni modification ni suppression (accès ${appAccess})`,
      async () => {
        await expectPgError(
          withOrganisation(app.db, orgA, (tx) =>
            tx.execute(sql`update ${t} set organisation_id = organisation_id`),
          ),
          /permission denied/,
        );
        await expectPgError(
          withOrganisation(app.db, orgA, (tx) => tx.execute(sql`delete from ${t}`)),
          /permission denied/,
        );
      },
    );

    it.skipIf(appendOnly)("ne modifie aucune ligne d'une autre organisation", async () => {
      const updated = await withOrganisation(app.db, orgA, (tx) =>
        organisationIds(
          tx,
          sql`update ${t} set updated_at = now() where organisation_id = ${orgB} returning organisation_id`,
        ),
      );
      expect(updated).toEqual([]);
    });

    it.skipIf(appendOnly)("ne supprime aucune ligne d'une autre organisation", async () => {
      const deleted = await withOrganisation(app.db, orgA, (tx) =>
        organisationIds(
          tx,
          sql`delete from ${t} where organisation_id = ${orgB} returning organisation_id`,
        ),
      );
      expect(deleted).toEqual([]);
      const remaining = await owner.db.execute(
        sql`select 1 from ${t} where organisation_id = ${orgB}`,
      );
      expect(remaining.rowCount).toBeGreaterThan(0);
    });

    it("n'écrit aucune ligne pour une autre organisation", async () => {
      const sample = sampleRows[table];
      if (!sample) return;
      await expectPgError(
        withOrganisation(app.db, orgA, (tx) => sample.insert(tx as unknown as Database, orgB)),
        appAccess === 'read-only' ? /permission denied/ : /row-level security/,
      );
    });
  });
});

describe('Isolation sur des connexions réutilisées (pool, PgBouncer en mode transaction)', () => {
  it("des transactions entremêlées de deux organisations ne voient jamais l'autre", async () => {
    const [orgA, orgB] = (await createOrganisations(2)) as [string, string];
    const owner = openOwner();
    await sampleRows.etablissement?.insert(owner.db, orgA);
    await sampleRows.etablissement?.insert(owner.db, orgB);
    await owner.close();

    const pooled = openApp();
    try {
      const runs = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? orgA : orgB));
      const results = await Promise.all(
        runs.map((org) =>
          withOrganisation(pooled.db, org, async (tx) => {
            await tx.execute(sql`select pg_sleep(0.005)`);
            const seen = await organisationIds(tx, sql`select organisation_id from etablissement`);
            return { org, seen };
          }),
        ),
      );
      for (const { org, seen } of results) {
        expect(new Set(seen)).toEqual(new Set([org]));
      }
    } finally {
      await pooled.close();
    }
  });
});
