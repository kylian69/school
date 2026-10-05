import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { buildDemoDataset } from '@scolaly/db/demo';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Auth } from '../src/auth/auth.js';
import { seedDemo } from '../src/demo/seed-demo.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp } from './helpers.js';

const PASSWORD = 'mot de passe de la démonstration';
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
});

describe('Chargement du jeu de démonstration', () => {
  it('crée les données et un compte par rôle et par école, une seule fois', async () => {
    const auth = app.get<Auth>(AUTH);
    const migratorUrl = inject('migratorUrl');
    const premier = await seedDemo({ auth, migratorUrl, password: PASSWORD });
    expect(premier.donneesEcrites).toBe(true);
    expect(premier.comptesCrees).toEqual(buildDemoDataset().comptes.map((c) => c.email));
    expect(premier.comptesCrees).toHaveLength(8);

    const second = await seedDemo({ auth, migratorUrl, password: PASSWORD });
    expect(second).toEqual({ donneesEcrites: false, comptesCrees: [] });
  });

  it('permet de se connecter avec un compte de démonstration', async () => {
    const [administrateur] = buildDemoDataset().comptes;
    if (!administrateur) throw new Error('Compte attendu');
    expect(await signInCookie(app, administrateur.email, PASSWORD)).toMatch(/session_token=/);
  });
});
