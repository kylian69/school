import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { inject } from 'vitest';
import { createApp, type CreateAppOptions } from '../src/app.js';
import type { Env } from '../src/config/env.js';

export const WEB_ORIGIN = 'http://localhost:3000';

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    LOG_LEVEL: 'info',
    DATABASE_URL: inject('appUrl'),
    VALKEY_URL: inject('valkeyUrl'),
    PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN,
    BETTER_AUTH_SECRET: 'secret-de-test-uniquement-pas-pour-la-production',
    ...overrides,
  };
}

export async function startApp(
  overrides: Partial<Env> = {},
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await createApp(testEnv(overrides), options);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
