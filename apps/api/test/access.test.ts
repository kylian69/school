import { readFile } from 'node:fs/promises';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Permission } from '@scolaly/contracts';
import { newId } from '@scolaly/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCESS_RESOLVER,
  type Access,
  type AccessResolver,
} from '../src/access/access-resolver.js';
import { Authenticated, Public, RequirePermission } from '../src/access/access.decorators.js';
import { RequestContext } from '../src/access/request-context.js';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { ApiContract } from '../src/contracts/api-contract.js';
import { OPENAPI_FILE, OPENAPI_VERSION } from '../src/contracts/openapi-file.js';
import { buildOpenApiDocument } from '../src/contracts/openapi.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp } from './helpers.js';

const Saisie = z.object({ nom: z.string().min(2) });

@Controller('essai')
class EssaiController {
  @Get('public')
  @Public()
  ouvert() {
    return { ok: true };
  }

  @Get('connecte')
  @Authenticated()
  connecte() {
    return { ok: true };
  }

  @Get('organisation')
  @RequirePermission('organisation:lire')
  async organisation() {
    const result = await RequestContext.tx().execute<{ org: string }>(
      sql`select app_current_organisation_id() as org`,
    );
    return { rls: result.rows[0]?.org, access: RequestContext.access().organisationId };
  }

  @Post('saisie')
  @RequirePermission('organisation:modifier')
  @ApiContract({ summary: 'Essai de saisie', body: Saisie, response: Saisie })
  saisie(@Body() body: z.infer<typeof Saisie>) {
    return body;
  }
}

@Module({ controllers: [EssaiController] })
class EssaiModule {}

/** Droits configurables par le test : compte → organisation et permissions. */
const grants = new Map<string, { organisationId: string; permissions: Permission[] }>();
class TestAccessResolver implements AccessResolver {
  resolve(userId: string): Promise<Access | null> {
    const grant = grants.get(userId);
    return Promise.resolve(
      grant
        ? { userId, organisationId: grant.organisationId, permissions: new Set(grant.permissions) }
        : null,
    );
  }
}

const PASSWORD = 'mot de passe des tests de droits';
let app: NestFastifyApplication;
let cookie: string;
let userId: string;
const organisationId = newId();

beforeAll(async () => {
  app = await startApp(
    {},
    {
      accessResolver: { provide: ACCESS_RESOLVER, useClass: TestAccessResolver },
      extraModules: [EssaiModule],
    },
  );
  ({ userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email: 'droits@exemple.test',
    name: 'Droits',
    password: PASSWORD,
  }));
  cookie = await signInCookie(app, 'droits@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
});

const get = (url: string, withCookie = true) =>
  app.inject({ method: 'GET', url, headers: withCookie ? { cookie } : {} });

describe('Deux barrières : permission déclarée et organisation de la session', () => {
  it('une route publique répond sans session', async () => {
    expect((await get('/essai/public', false)).statusCode).toBe(200);
  });

  it('une route protégée refuse une requête sans session, avec la marche à suivre', async () => {
    const response = await get('/essai/connecte', false);
    expect(response.statusCode).toBe(401);
    expect(response.json<{ message: string }>().message).toMatch(/reconnectez-vous/);
    expect((await get('/essai/connecte')).statusCode).toBe(200);
  });

  it("refuse une permission que le compte n'a pas dans l'organisation", async () => {
    grants.delete(userId);
    const response = await get('/essai/organisation');
    expect(response.statusCode).toBe(403);
    expect(response.json<{ message: string }>().message).toMatch(/administrateur/);
  });

  it("exécute le traitement dans une transaction limitée à l'organisation (RLS)", async () => {
    grants.set(userId, { organisationId, permissions: ['organisation:lire'] });
    const response = await get('/essai/organisation');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rls: organisationId, access: organisationId });
  });

  it('RG-01-16 un retrait de droit prend effet à la requête suivante', async () => {
    grants.set(userId, { organisationId, permissions: ['organisation:lire'] });
    expect((await get('/essai/organisation')).statusCode).toBe(200);
    grants.set(userId, { organisationId, permissions: [] });
    expect((await get('/essai/organisation')).statusCode).toBe(403);
  });

  it("le contexte d'organisation n'existe pas hors d'une route protégée", () => {
    expect(() => RequestContext.tx()).toThrow(/Aucun contexte d'organisation/);
  });

  it('valide les entrées avec le contrat Zod et explique les erreurs en français', async () => {
    grants.set(userId, { organisationId, permissions: ['organisation:modifier'] });
    const invalide = await app.inject({
      method: 'POST',
      url: '/essai/saisie',
      headers: { cookie },
      payload: { nom: 'A' },
    });
    expect(invalide.statusCode).toBe(400);
    expect(invalide.json()).toMatchObject({
      message: expect.stringMatching(/Corrigez les champs signalés/) as unknown,
      details: [expect.stringMatching(/^nom : Trop petit/) as unknown],
    });
    const valide = await app.inject({
      method: 'POST',
      url: '/essai/saisie',
      headers: { cookie },
      payload: { nom: 'Atelier', inattendu: true },
    });
    expect(valide.statusCode).toBe(201);
    expect(valide.json()).toEqual({ nom: 'Atelier' });
  });
});

describe('Contrôle au démarrage', () => {
  it("refuse de démarrer si une route ne déclare pas sa règle d'accès", async () => {
    @Controller('oubli')
    class OubliController {
      @Get()
      oubli() {
        return {};
      }
    }
    @Module({ controllers: [OubliController] })
    class OubliModule {}
    await expect(startApp({}, { extraModules: [OubliModule] })).rejects.toThrow(
      /Routes sans règle d'accès : OubliController\.oubli/,
    );
  });
});

describe('Document OpenAPI', () => {
  it('le fichier versionné est à jour (sinon : pnpm --filter @scolaly/api openapi)', async () => {
    const production = await startApp();
    try {
      const attendu = buildOpenApiDocument(production, OPENAPI_VERSION);
      const versionne: unknown = JSON.parse(await readFile(OPENAPI_FILE, 'utf8'));
      expect(versionne).toEqual(attendu);
      expect(attendu.paths['/health']).toMatchObject({
        get: { 'x-scolaly-access': { kind: 'public' } },
      });
    } finally {
      await production.close();
    }
  });
});
