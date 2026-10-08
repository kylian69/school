import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import pg from 'pg';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Clé du verrou consultatif qui empêche deux exécutions simultanées des migrations. */
const MIGRATION_LOCK_KEY = 7_302_118_001;

/**
 * Applique les migrations avec le rôle `scolaly_migrator`, sous verrou consultatif. La connexion
 * doit être directe (pas PgBouncer en mode transaction), car le verrou est lié à la session.
 *
 * Même suivi que le migrateur de Drizzle (table `drizzle.__drizzle_migrations`, une migration est
 * appliquée si sa date du journal est postérieure à la dernière appliquée), mais **une transaction
 * par migration** (ADR 0005) : une valeur d'enum ajoutée par une migration (`ALTER TYPE … ADD
 * VALUE`) est validée avant qu'une migration suivante ne l'utilise.
 */
export async function runMigrations(
  migratorUrl: string,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query('create schema if not exists drizzle');
    await client.query(
      'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
    );
    const { rows } = await client.query<{ created_at: string }>(
      'select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1',
    );
    const last = rows[0] ? Number(rows[0].created_at) : undefined;
    for (const migration of migrations) {
      if (last !== undefined && migration.folderMillis <= last) continue;
      await client.query('begin');
      try {
        for (const statement of migration.sql) await client.query(statement);
        await client.query(
          'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
          [migration.hash, migration.folderMillis],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client
      .query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    await client.end();
  }
}
