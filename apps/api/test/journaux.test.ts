import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { masquerJetonsUrl } from '../src/app.js';
import { freshIp, startApp, WEB_ORIGIN } from './helpers.js';

const SECRET = 'jeton-secret-a-ne-jamais-journaliser';

let app: NestFastifyApplication;
const lignes: string[] = [];

beforeAll(async () => {
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lignes.push(chunk.toString());
      callback();
    },
  });
  app = await startApp({ LOG_LEVEL: 'trace' }, { logStream });
});

afterAll(async () => {
  await app.close();
});

/** Journaux écrits pendant une requête. */
async function journauxDe(methode: 'GET' | 'POST', url: string, payload?: object) {
  const debut = lignes.length;
  await app.inject({
    method: methode,
    url,
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
    ...(payload ? { payload } : {}),
  });
  return lignes.slice(debut).join('');
}

describe('Adresses secrètes dans les journaux', () => {
  it.each([
    ['GET', `/api/invitations/${SECRET}`, '/api/invitations/[masqué]'],
    ['POST', `/api/invitations/${SECRET}/activation`, '/api/invitations/[masqué]/activation'],
    ['GET', `/api/agenda/${SECRET}.ics`, '/api/agenda/[masqué]'],
    [
      'GET',
      `/api/auth/magic-link/verify?token=${SECRET}&callbackURL=/`,
      '/api/auth/magic-link/verify?token=[masqué]&callbackURL=/',
    ],
    ['GET', `/api/auth/verify-email?token=${SECRET}`, '/api/auth/verify-email?token=[masqué]'],
    [
      'GET',
      `/api/auth/reset-password/${SECRET}?callbackURL=/`,
      '/api/auth/reset-password/[masqué]?callbackURL=/',
    ],
  ] as const)('US-01-07 %s %s est journalisé masqué', async (methode, url, attendu) => {
    const journaux = await journauxDe(
      methode,
      url,
      methode === 'POST' ? { motDePasse: 'x', conditions: true } : undefined,
    );
    expect(journaux.length).toBeGreaterThan(0);
    expect(journaux).not.toContain(SECRET);
    expect(journaux).toContain(attendu);
  });

  it('US-01-07 masque les jetons du chemin, même encodés', () => {
    expect(masquerJetonsUrl('/api/invitations/abc')).toBe('/api/invitations/[masqué]');
    expect(masquerJetonsUrl('/api/invitations/abc/activation')).toBe(
      '/api/invitations/[masqué]/activation',
    );
    expect(masquerJetonsUrl('/api/%69nvitations/abc')).toBe('/api/invitations/[masqué]');
    expect(masquerJetonsUrl('/API/Agenda/abc')).toBe('/api/agenda/[masqué]');
    expect(masquerJetonsUrl('/api/agenda/a%2Fb.ics')).toBe('/api/agenda/[masqué]');
    expect(masquerJetonsUrl('/api/moi/agenda')).toBe('/api/moi/agenda');
    expect(masquerJetonsUrl('/api/invitations')).toBe('/api/invitations');
  });

  it('US-01-08 masque les paramètres secrets de la requête, quelle que soit la route', () => {
    expect(masquerJetonsUrl('/x?Token=a&b=1&jeton=c&code&%74oken=d')).toBe(
      '/x?Token=[masqué]&b=1&jeton=[masqué]&code=[masqué]&%74oken=[masqué]',
    );
    expect(masquerJetonsUrl('/api/personnes?page=2')).toBe('/api/personnes?page=2');
  });
});

describe('Position de l’émargement dans les journaux (RGPD-03)', () => {
  it('RGPD-03 la position envoyée au scan n’apparaît jamais, même en niveau trace', async () => {
    const position = { latitude: 45.123456, longitude: 4.654321, precisionMetres: 17.5 };
    for (const [url, payload] of [
      ['/api/emargement/scan', { jeton: 'qr-invalide', position }],
      ['/api/emargement/code', { seanceId: 'pas-un-uuid', code: '12', position }],
      [
        '/api/emargement/code',
        {
          seanceId: '01a12565-ed83-728c-88db-527f1d440b90',
          code: '123456',
          position: { ...position, latitude: 945.123456 },
        },
      ],
    ] as const) {
      const journaux = await journauxDe('POST', url, payload);
      expect(journaux.length).toBeGreaterThan(0);
      expect(journaux).not.toMatch(/45\.123|4\.654|945\.12|17\.5|latitude|longitude/);
    }
  });
});
