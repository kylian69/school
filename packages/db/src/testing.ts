import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { bootstrapRoles } from './bootstrap.js';
import { runMigrations } from './migrate.js';
import { APP_ROLE, MIGRATOR_ROLE, PLATFORM_ROLE } from './roles.js';

/**
 * Base PostgreSQL jetable pour les tests d'intégration : base dédiée, rôles et schéma complet.
 * Serveur d'administration par défaut : PostgreSQL 17 local sur le port 55432
 * (`TEST_ADMIN_DATABASE_URL` pour un autre serveur). Réservé aux tests.
 */
export interface TestDatabase {
  adminUrl: string;
  migratorUrl: string;
  appUrl: string;
  platformUrl: string;
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

/**
 * Les rôles sont communs à tout le serveur PostgreSQL, alors que plusieurs suites de tests créent
 * leur base en parallèle : mots de passe fixes (réservés aux tests) et amorçage sérialisé par un
 * verrou consultatif pris sur la base d'administration.
 */
// Mêmes valeurs que .env.example : développement et tests partagent le serveur PostgreSQL local.
const TEST_MIGRATOR_PASSWORD = 'scolaly-dev-migrator';
const TEST_APP_PASSWORD = 'scolaly-dev-app';
const TEST_PLATFORM_PASSWORD = 'scolaly-dev-platform';
const BOOTSTRAP_LOCK_KEY = 7_302_118_002;

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
  options: { migrationsFolder?: string } = {},
): Promise<TestDatabase> {
  const database = `scolaly_test_${randomBytes(4).toString('hex')}`;
  const migratorPassword = TEST_MIGRATOR_PASSWORD;
  const appPassword = TEST_APP_PASSWORD;
  const adminUrl = withDatabase(serverUrl, database);

  const lock = new pg.Client({ connectionString: serverUrl });
  await lock.connect();
  try {
    await lock.query('select pg_advisory_lock($1)', [BOOTSTRAP_LOCK_KEY]);
    await lock.query(`create database ${database}`);
    await bootstrapRoles({
      adminUrl,
      migratorPassword,
      appPassword,
      platformPassword: TEST_PLATFORM_PASSWORD,
    });
  } finally {
    await lock.query('select pg_advisory_unlock($1)', [BOOTSTRAP_LOCK_KEY]).catch(() => undefined);
    await lock.end();
  }
  const migratorUrl = withDatabase(serverUrl, database, MIGRATOR_ROLE, migratorPassword);
  await runMigrations(migratorUrl, options.migrationsFolder);

  return {
    adminUrl,
    migratorUrl,
    appUrl: withDatabase(serverUrl, database, APP_ROLE, appPassword),
    platformUrl: withDatabase(serverUrl, database, PLATFORM_ROLE, TEST_PLATFORM_PASSWORD),
    drop: () => adminQuery(serverUrl, `drop database if exists ${database} with (force)`),
  };
}
