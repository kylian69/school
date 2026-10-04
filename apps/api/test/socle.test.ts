import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { ConfigurationError, loadEnv } from '../src/config/env.js';
import { AUTH } from '../src/shared/tokens.js';
import { startApp, testEnv, WEB_ORIGIN } from './helpers.js';

describe("Socle de l'API", () => {
  it('GET /health répond 200 avec les en-têtes de sécurité', async () => {
    const app = await startApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      expect(response.headers['strict-transport-security']).toMatch(/max-age=63072000/);
      expect(response.headers['content-security-policy']).toMatch(/default-src 'none'/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await app.close();
    }
  });

  it("n'écrit ni mot de passe ni cookie dans les journaux", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const app = await startApp({ LOG_LEVEL: 'trace' }, { logStream });
    try {
      const password = 'mot de passe secret à ne pas journaliser';
      await createPasswordAccount(app.get<Auth>(AUTH), {
        email: 'journal@exemple.test',
        name: 'Journal',
        password,
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: WEB_ORIGIN, 'x-forwarded-for': '203.0.113.7' },
        payload: { email: 'journal@exemple.test', password },
      });
      const cookie = [response.headers['set-cookie'] ?? []].flat()[0]?.split(';')[0] ?? 'absent';
      const logs = lines.join('');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).not.toContain(password);
      expect(logs).not.toContain(cookie.split('=')[1] ?? 'absent');
    } finally {
      await app.close();
    }
  });

  it('refuse de démarrer avec une configuration invalide, en expliquant quoi corriger', () => {
    const env = { ...testEnv(), BETTER_AUTH_SECRET: 'court', DATABASE_URL: 'pas-une-url' };
    expect(() => loadEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(ConfigurationError);
    expect(() => loadEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(
      /BETTER_AUTH_SECRET : au moins 32 caractères/,
    );
  });
});
