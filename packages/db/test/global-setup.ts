import type { TestProject } from 'vitest/node';
import { createTestDatabase } from '../src/testing.js';

export default async function setup(project: TestProject) {
  const database = await createTestDatabase();
  project.provide('adminUrl', database.adminUrl);
  project.provide('migratorUrl', database.migratorUrl);
  project.provide('appUrl', database.appUrl);
  project.provide('platformUrl', database.platformUrl);
  return database.drop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string;
    migratorUrl: string;
    appUrl: string;
    platformUrl: string;
  }
}
