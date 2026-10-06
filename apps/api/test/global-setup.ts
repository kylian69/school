import { createTestDatabase } from '@scolaly/db/testing';
import { Redis } from 'ioredis';
import type { TestProject } from 'vitest/node';

/** Base PostgreSQL jetable et base Valkey dédiée (n° 15), vidée au démarrage. */
export default async function setup(project: TestProject) {
  const database = await createTestDatabase();
  const valkeyUrl = process.env.TEST_VALKEY_URL ?? 'redis://localhost:56379/15';
  const valkey = new Redis(valkeyUrl);
  await valkey.flushdb();
  valkey.disconnect();

  project.provide('appUrl', database.appUrl);
  project.provide('migratorUrl', database.migratorUrl);
  project.provide('valkeyUrl', valkeyUrl);
  return database.drop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    migratorUrl: string;
    valkeyUrl: string;
  }
}
