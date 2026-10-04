import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Clé du verrou consultatif qui empêche deux exécutions simultanées des migrations. */
const MIGRATION_LOCK_KEY = 7_302_118_001;

/**
 * Applique les migrations avec le rôle `scolaly_migrator`, sous verrou consultatif. La connexion
 * doit être directe (pas PgBouncer en mode transaction), car le verrou est lié à la session.
 */
export async function runMigrations(migratorUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle({ client, casing: 'snake_case' }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await client
      .query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    await client.end();
  }
}
