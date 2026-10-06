import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { bootstrapRoles } from '../src/bootstrap.js';
import { runMigrations } from '../src/migrate.js';

/**
 * Crée une base jetable, les rôles et le schéma complet, puis fournit aux tests les URL de
 * connexion. Base d'administration par défaut : PostgreSQL 17 local sur le port 55432.
 */
const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/postgres';

const withDatabase = (url: string, database: string, user?: string, password?: string) => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
};

export default async function setup(project: TestProject) {
  const database = `scolaly_test_${randomBytes(4).toString('hex')}`;
  const migratorPassword = randomBytes(12).toString('hex');
  const appPassword = randomBytes(12).toString('hex');

  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${database}`);
  await admin.end();

  const adminUrl = withDatabase(ADMIN_URL, database);
  await bootstrapRoles({ adminUrl, migratorPassword, appPassword });
  const migratorUrl = withDatabase(ADMIN_URL, database, 'scolaly_migrator', migratorPassword);
  await runMigrations(migratorUrl);

  project.provide('adminUrl', adminUrl);
  project.provide('migratorUrl', migratorUrl);
  project.provide('appUrl', withDatabase(ADMIN_URL, database, 'scolaly_app', appPassword));

  return async () => {
    const cleanup = new pg.Client({ connectionString: ADMIN_URL });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${database} with (force)`);
    await cleanup.end();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string;
    migratorUrl: string;
    appUrl: string;
  }
}
