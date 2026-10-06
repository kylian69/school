import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@scolaly/db/testing';
import type { TestProject } from 'vitest/node';

/** Base PostgreSQL jetable ; préfixe BullMQ unique pour ne rien partager avec d'autres tests. */
export default async function setup(project: TestProject) {
  const database = await createTestDatabase();
  project.provide('appUrl', database.appUrl);
  project.provide('migratorUrl', database.migratorUrl);
  project.provide('valkeyUrl', process.env.TEST_VALKEY_URL ?? 'redis://localhost:56379/15');
  project.provide('queuePrefix', `test-worker-${randomBytes(4).toString('hex')}`);
  project.provide('smtpUrl', process.env.TEST_SMTP_URL ?? 'smtp://localhost:51025');
  project.provide('mailpitApi', process.env.TEST_MAILPIT_API ?? 'http://localhost:58025');
  return database.drop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    migratorUrl: string;
    valkeyUrl: string;
    queuePrefix: string;
    smtpUrl: string;
    mailpitApi: string;
  }
}
