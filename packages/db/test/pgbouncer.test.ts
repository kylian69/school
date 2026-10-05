import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { withOrganisation } from '../src/organisation-context.js';
import { etablissement } from '../src/schema/index.js';
import { createOrganisations, openOwner } from './fixtures.js';

/**
 * Architecture section 3 : `SET LOCAL` est compatible avec PgBouncer en mode transaction.
 * Vérifié en passant réellement par PgBouncer (`pnpm dev:up` en local, service dédié en CI).
 * Sans PgBouncer joignable, le test est ignoré en local mais doit tourner en CI (TEST_PGBOUNCER).
 */
const pgbouncerHost = process.env.TEST_PGBOUNCER_HOST ?? 'localhost:56432';
const viaPgbouncer = () => {
  const url = new URL(inject('appUrl'));
  url.host = pgbouncerHost;
  return url.toString();
};

async function reachable(): Promise<boolean> {
  const probe = createDatabase(viaPgbouncer(), { max: 1 });
  try {
    await probe.db.execute(sql`select 1`);
    return true;
  } catch (error) {
    if (process.env.TEST_PGBOUNCER) throw error;
    console.warn(`PgBouncer injoignable sur ${pgbouncerHost} : test ignoré (lancer pnpm dev:up).`);
    return false;
  } finally {
    await probe.close();
  }
}

describe.runIf(await reachable())(
  'RG-00-01 isolation derrière PgBouncer en mode transaction',
  () => {
    const pooled = createDatabase(viaPgbouncer(), { max: 8 });

    afterAll(async () => {
      await pooled.close();
    });

    it('des transactions entremêlées de deux organisations ne voient jamais l’autre', async () => {
      const [orgA, orgB] = (await createOrganisations(2)) as [string, string];
      const owner = openOwner();
      await owner.db.insert(etablissement).values([
        { organisationId: orgA, nom: 'Campus A' },
        { organisationId: orgB, nom: 'Campus B' },
      ]);
      await owner.close();

      const runs = Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? orgA : orgB));
      const results = await Promise.all(
        runs.map((org) =>
          withOrganisation(pooled.db, org, async (tx) => {
            await tx.execute(sql`select pg_sleep(0.002)`);
            const rows = await tx.select({ org: etablissement.organisationId }).from(etablissement);
            return { org, seen: new Set(rows.map((r) => r.org)) };
          }),
        ),
      );
      for (const { org, seen } of results) expect(seen).toEqual(new Set([org]));
    });

    it("l'organisation ne fuit jamais vers la requête suivante d'une connexion partagée", async () => {
      const [org] = (await createOrganisations(1)) as [string];
      await Promise.all(
        Array.from({ length: 20 }, () => withOrganisation(pooled.db, org, () => Promise.resolve())),
      );
      const after = await Promise.all(
        Array.from({ length: 20 }, () =>
          pooled.db.execute<{ org: string | null }>(
            sql`select app_current_organisation_id() as org`,
          ),
        ),
      );
      expect(after.every((r) => r.rows[0]?.org === null)).toBe(true);
    });
  },
);
