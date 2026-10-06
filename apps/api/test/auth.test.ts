import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { authAccount, createDatabase } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'un mot de passe assez long';
let app: NestFastifyApplication;
let auth: Auth;
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

const signIn = (email: string, password: string, ip = freshIp()) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': ip },
    payload: { email, password },
  });

const sessionCookie = (setCookie: string | string[] | undefined) =>
  [setCookie ?? []]
    .flat()
    .map((c) => c.split(';')[0])
    .join('; ');

beforeAll(async () => {
  app = await startApp();
  auth = app.get<Auth>(AUTH);
  await createPasswordAccount(auth, {
    email: 'camille@exemple.test',
    name: 'Camille',
    password: PASSWORD,
  });
});

afterAll(async () => {
  await app.close();
});

describe('Authentification (architecture section 4)', () => {
  it('stocke le mot de passe haché en Argon2id, jamais en clair', async () => {
    const owner = createDatabase(inject('migratorUrl'), { max: 1 });
    try {
      const comptes = await owner.db
        .select()
        .from(authAccount)
        .where(eq(authAccount.providerId, 'credential'));
      expect(comptes[0]?.password).toMatch(/^\$argon2id\$/);
      expect(comptes[0]?.password).not.toContain(PASSWORD);
    } finally {
      await owner.close();
    }
  });

  it('RG-01-10 refuse un mot de passe de moins de 12 caractères', async () => {
    await expect(
      createPasswordAccount(auth, {
        email: 'court@exemple.test',
        name: 'Court',
        password: 'trop-court',
      }),
    ).rejects.toThrow(/au moins 12 caractères/);
  });

  it("RG-01-08 l'inscription libre est fermée : les comptes sont créés sur invitation", async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
      payload: { email: 'intrus@exemple.test', password: PASSWORD, name: 'Intrus' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('ouvre une session serveur transmise par un cookie HttpOnly et SameSite=Lax', async () => {
    const response = await signIn('camille@exemple.test', PASSWORD);
    expect(response.statusCode).toBe(200);
    const cookie = [response.headers['set-cookie'] ?? []]
      .flat()
      .find((c) => c.includes('session_token'));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(response.body).not.toContain('session_token');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: sessionCookie(response.headers['set-cookie']) },
    });
    expect(session.json()).toMatchObject({ user: { email: 'camille@exemple.test' } });
  });

  it('refuse un mauvais mot de passe sans dire si le compte existe', async () => {
    const mauvais = await signIn('camille@exemple.test', 'pas le bon mot de passe');
    const inconnu = await signIn('personne@exemple.test', 'pas le bon mot de passe');
    expect(mauvais.statusCode).toBe(401);
    expect(inconnu.statusCode).toBe(401);
    expect(mauvais.json()).toEqual(inconnu.json());
  });

  it('révoque la session à la déconnexion', async () => {
    const connexion = await signIn('camille@exemple.test', PASSWORD);
    const cookie = sessionCookie(connexion.headers['set-cookie']);
    const deconnexion = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(deconnexion.statusCode).toBe(200);
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(session.json()).toBeNull();
  });

  it('limite les tentatives de connexion par adresse IP (compteurs dans Valkey)', async () => {
    const ip = freshIp();
    const statuts: number[] = [];
    for (let i = 0; i < 12; i++)
      statuts.push((await signIn('camille@exemple.test', 'mauvais mot de passe', ip)).statusCode);
    expect(statuts.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuts.slice(10)).toEqual([429, 429]);
  });
});

describe('Cookies en production', () => {
  it('ajoute Secure et le préfixe __Secure- au cookie de session', async () => {
    const production = await startApp({
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://api.exemple.test',
    });
    try {
      const response = await production.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
        payload: { email: 'camille@exemple.test', password: PASSWORD },
      });
      const cookie = [response.headers['set-cookie'] ?? []]
        .flat()
        .find((c) => c.includes('session_token'));
      expect(cookie).toMatch(/^__Secure-scolaly\.session_token=/);
      expect(cookie).toMatch(/; Secure/i);
    } finally {
      await production.close();
    }
  });
});
