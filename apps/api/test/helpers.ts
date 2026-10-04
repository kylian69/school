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

let ipCounter = 0;
/** Adresse IP distincte par appel, pour ne pas partager les compteurs de limitation de débit. */
export const freshIp = () => `198.18.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

/** Ouvre une session et renvoie l'en-tête Cookie à rejouer. */
export async function signInCookie(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`Connexion impossible : ${response.body}`);
  return [response.headers['set-cookie'] ?? []]
    .flat()
    .map((c) => c.split(';')[0])
    .join('; ');
}
