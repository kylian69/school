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
  project.provide('s3Endpoint', process.env.TEST_S3_ENDPOINT ?? 'http://localhost:59000');
  project.provide('s3AccessKey', process.env.TEST_S3_ACCESS_KEY ?? 'GK0000000000000000000000d1');
  project.provide('s3Region', process.env.TEST_S3_REGION ?? 'garage');
  project.provide(
    's3SecretKey',
    process.env.TEST_S3_SECRET_KEY ??
      '00000000000000000000000000000000000000000000000000000000000000d1',
  );
  return database.drop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    migratorUrl: string;
    valkeyUrl: string;
    s3Endpoint: string;
    s3AccessKey: string;
    s3SecretKey: string;
    s3Region: string;
  }
}
