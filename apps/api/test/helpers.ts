import 'reflect-metadata';
import { createHmac } from 'node:crypto';
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
export async function emailsEnFile(): Promise<
  { to: string; subject: string; text: string; html?: string }[]
> {
  const queue = new Queue(QUEUES.emails, {
    connection: { url: inject('valkeyUrl') },
    prefix: TEST_QUEUE_PREFIX,
  });
  try {
    const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized']);
    return jobs
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((job) => job.data as { to: string; subject: string; text: string; html?: string });
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

/**
 * Chaque fichier de test réévalue ce module alors que les compteurs de limitation de débit
 * persistent dans Valkey : le compteur part d'un point aléatoire de la plage réservée aux tests
 * (198.18.0.0/15, 131 072 adresses) pour que deux fichiers ne réutilisent pas les mêmes adresses.
 */
let ipCounter = Math.floor(Math.random() * 120_000);
/** Adresse IP distincte par appel, pour ne pas partager les compteurs de limitation de débit. */
export const freshIp = () => {
  const n = ++ipCounter % 131_072;
  return `198.${String(18 + (n >> 16))}.${String((n >> 8) & 255)}.${String(n & 255)}`;
};

/** Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) d'un secret en base32, comme une application. */
export function codeTotp(secretBase32: string, instant = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const cle = Buffer.from(bits.match(/.{8}/g)?.map((o) => parseInt(o, 2)) ?? []);
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(instant / 30_000)));
  const hmac = createHmac('sha1', cle).update(compteur).digest();
  const decalage = (hmac.at(-1) ?? 0) & 0xf;
  return ((hmac.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** Fusionne les cookies reçus dans un en-tête Cookie (les cookies effacés disparaissent). */
export function fusionnerCookies(cookie: string, setCookie: string | string[] | undefined): string {
  const jar = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((c) => [c.slice(0, c.indexOf('=')), c] as const),
  );
  for (const ligne of [setCookie ?? []].flat()) {
    const paire = ligne.split(';')[0] ?? '';
    const nom = paire.slice(0, paire.indexOf('='));
    if (paire.endsWith('=') || /max-age=0/i.test(ligne)) jar.delete(nom);
    else jar.set(nom, paire);
  }
  return [...jar.values()].join('; ');
}

/** Secrets TOTP des comptes de test qui ont activé la double authentification. */
const secretsTotp = new Map<string, string>();

/** Active la double authentification d'une session (parcours réel) ; renvoie le nouveau cookie. */
export async function activerDoubleAuthentification(
  app: NestFastifyApplication,
  cookie: string,
  email: string,
  password: string,
): Promise<{ cookie: string; codesDeSecours: string[] }> {
  const headers = { cookie, origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() };
  const activation = await app.inject({
    method: 'POST',
    url: '/api/auth/two-factor/enable',
    headers,
    payload: { password },
  });
  if (activation.statusCode !== 200) throw new Error(`Activation impossible : ${activation.body}`);
  const { totpURI, backupCodes } = activation.json<{ totpURI: string; backupCodes: string[] }>();
  const secret = new URL(totpURI).searchParams.get('secret') ?? '';
  const verification = await app.inject({
    method: 'POST',
    url: '/api/auth/two-factor/verify-totp',
    headers,
    payload: { code: codeTotp(secret) },
  });
  if (verification.statusCode !== 200) throw new Error(`Code refusé : ${verification.body}`);
  secretsTotp.set(email.toLowerCase(), secret);
  return {
    cookie: fusionnerCookies(cookie, verification.headers['set-cookie']),
    codesDeSecours: backupCodes,
  };
}

/**
 * Ouvre une session et renvoie l'en-tête Cookie à rejouer. Par défaut, le compte a la double
 * authentification activée (exigée par la plupart des rôles) : elle est mise en place à la
 * première connexion, puis le code est saisi à chaque connexion suivante.
 */
export async function signInCookie(
  app: NestFastifyApplication,
  email: string,
  password: string,
  { doubleAuthentification = true }: { doubleAuthentification?: boolean } = {},
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`Connexion impossible : ${response.body}`);
  let cookie = fusionnerCookies('', response.headers['set-cookie']);
  const secret = secretsTotp.get(email.toLowerCase());
  if (response.json<{ twoFactorRedirect?: boolean }>().twoFactorRedirect) {
    if (!secret) throw new Error(`Secret TOTP inconnu pour ${email}`);
    const verification = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { cookie, origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
      payload: { code: codeTotp(secret) },
    });
    if (verification.statusCode !== 200) throw new Error(`Code refusé : ${verification.body}`);
    return fusionnerCookies(cookie, verification.headers['set-cookie']);
  }
  if (doubleAuthentification) {
    cookie = (await activerDoubleAuthentification(app, cookie, email, password)).cookie;
  }
  return cookie;
}
