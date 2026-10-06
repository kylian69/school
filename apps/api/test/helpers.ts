import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { QUEUES } from '@scolaly/contracts';
import { Queue } from 'bullmq';
import { inject } from 'vitest';
import { createApp, type CreateAppOptions } from '../src/app.js';
import type { Env } from '../src/config/env.js';

export const WEB_ORIGIN = 'http://localhost:3000';

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    SCOLALY_MODE: 'saas',
    PLATFORM_DATABASE_URL: inject('platformUrl'),
    PORT: 0,
    LOG_LEVEL: 'info',
    DATABASE_URL: inject('appUrl'),
    VALKEY_URL: inject('valkeyUrl'),
    PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN,
    BETTER_AUTH_SECRET: 'secret-de-test-uniquement-pas-pour-la-production',
    S3_ENDPOINT: inject('s3Endpoint'),
    S3_REGION: inject('s3Region'),
    S3_BUCKET: 'scolaly-test',
    S3_ACCESS_KEY_ID: inject('s3AccessKey'),
    S3_SECRET_ACCESS_KEY: inject('s3SecretKey'),
    S3_FORCE_PATH_STYLE: true,
    CLAMAV_PORT: 3310,
    ANTIVIRUS_DISABLED: true,
    ...overrides,
  };
}

/** Préfixe des files BullMQ de ce processus de test (emails envoyés par l'API). */
export const TEST_QUEUE_PREFIX = `test-api-${process.pid}-${Date.now()}`;

/** Emails mis en file par l'API (le worker ne tourne pas pendant ces tests). */
export async function emailsEnFile(): Promise<{ to: string; subject: string; text: string }[]> {
  const queue = new Queue(QUEUES.emails, {
    connection: { url: inject('valkeyUrl') },
    prefix: TEST_QUEUE_PREFIX,
  });
  try {
    const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized']);
    return jobs
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((job) => job.data as { to: string; subject: string; text: string });
  } finally {
    await queue.close();
  }
}

export async function startApp(
  overrides: Partial<Env> = {},
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await createApp(testEnv(overrides), { queuePrefix: TEST_QUEUE_PREFIX, ...options });
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
