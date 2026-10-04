import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Connexion de l'application, avec le rôle `scolaly_app` (soumis à RLS). Compatible avec PgBouncer
 * en mode transaction : aucune requête préparée nommée, l'organisation est fixée par transaction.
 */
export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, close: () => pool.end() } satisfies DatabaseHandle;
}
