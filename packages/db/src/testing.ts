import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { bootstrapRoles } from './bootstrap.js';
import { runMigrations } from './migrate.js';
import { APP_ROLE, MIGRATOR_ROLE } from './roles.js';

/**
 * Base PostgreSQL jetable pour les tests d'intégration : base dédiée, rôles et schéma complet.
 * Serveur d'administration par défaut : PostgreSQL 17 local sur le port 55432
 * (`TEST_ADMIN_DATABASE_URL` pour un autre serveur). Réservé aux tests.
 */
export interface TestDatabase {
  adminUrl: string;
  migratorUrl: string;
  appUrl: string;
  drop: () => Promise<void>;
}

const DEFAULT_ADMIN_URL = 'postgres://postgres:postgres@localhost:55432/postgres';

const withDatabase = (url: string, database: string, user?: string, password?: string) => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
};

async function adminQuery(url: string, query: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

export async function createTestDatabase(
  serverUrl = process.env.TEST_ADMIN_DATABASE_URL ?? DEFAULT_ADMIN_URL,
): Promise<TestDatabase> {
  const database = `scolaly_test_${randomBytes(4).toString('hex')}`;
  const migratorPassword = randomBytes(12).toString('hex');
  const appPassword = randomBytes(12).toString('hex');

  await adminQuery(serverUrl, `create database ${database}`);
  const adminUrl = withDatabase(serverUrl, database);
  await bootstrapRoles({ adminUrl, migratorPassword, appPassword });
  const migratorUrl = withDatabase(serverUrl, database, MIGRATOR_ROLE, migratorPassword);
  await runMigrations(migratorUrl);

  return {
    adminUrl,
    migratorUrl,
    appUrl: withDatabase(serverUrl, database, APP_ROLE, appPassword),
    drop: () => adminQuery(serverUrl, `drop database if exists ${database} with (force)`),
  };
}
