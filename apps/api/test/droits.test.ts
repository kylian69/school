import { Controller, Get, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ContexteSession } from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  organisationModule,
  personne,
  role,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { RequirePermission } from '../src/access/access.decorators.js';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

@Controller('essai-droits')
class EssaiDroitsController {
  @Get()
  @RequirePermission('audit:lire')
  lire() {
    return { ok: true };
  }
}

@Module({ controllers: [EssaiDroitsController] })
class EssaiDroitsModule {}

const PASSWORD = 'mot de passe des tests de droits réels';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
let cookie: string;
const ecoleA = newId();
const ecoleB = newId();
const ecoleSansFiche = newId();
let attributionAdmin = '';
let ficheA = '';

async function ecoleAvecRoles(id: string, nom: string) {
  await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
  await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  await owner.db
    .insert(organisationModule)
    .values({ organisationId: id, module: 'socle', actif: true, origine: 'formule' });
}

async function rattacher(organisationId: string, userId: string, code: string) {
  const [fiche] = await owner.db
    .insert(personne)
    .values({
      organisationId,
      nom: 'Fictive',
      prenom: 'Claire',
      email: `claire.${newId()}@exemple.test`,
      userId,
    })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  const [lAttribution] = await owner.db
    .insert(attribution)
    .values({
      organisationId,
      personneId: fiche?.id ?? '',
      roleId: leRole?.id ?? '',
      perimetreType: 'organisation',
      debut: '2026-01-01',
    })
    .returning();
  return { ficheId: fiche?.id ?? '', attributionId: lAttribution?.id ?? '' };
}

const contexte = async () =>
  (
    await app.inject({ method: 'GET', url: '/api/session/contexte', headers: { cookie } })
  ).json<ContexteSession>();
const choisir = (organisationId: string) =>
  app.inject({
    method: 'POST',
    url: '/api/session/ecole',
    headers: { cookie, origin: WEB_ORIGIN },
    payload: { organisationId },
  });
const essai = () => app.inject({ method: 'GET', url: '/essai-droits', headers: { cookie } });

beforeAll(async () => {
  app = await startApp({}, { extraModules: [EssaiDroitsModule] });
  await ecoleAvecRoles(ecoleA, 'Alpha école fictive');
  await ecoleAvecRoles(ecoleB, 'Bêta école fictive');
  await ecoleAvecRoles(ecoleSansFiche, 'Gamma école fictive');
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email: 'claire.droits@exemple.test',
    name: 'Claire Fictive',
    password: PASSWORD,
  });
  ({ attributionId: attributionAdmin, ficheId: ficheA } = await rattacher(
    ecoleA,
    userId,
    'administrateur',
  ));
  await rattacher(ecoleB, userId, 'apprenant');
  cookie = await signInCookie(app, 'claire.droits@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-01-29 école active et sélecteur', () => {
  it('à la connexion, choisit la première école du compte et liste ses écoles', async () => {
    const ctx = await contexte();
    expect(ctx.ecoleActive?.id).toBe(ecoleA);
    expect(ctx.ecoles.map((e) => e.id)).toEqual([ecoleA, ecoleB]);
    expect(ctx.permissions).toContain('roles:attribuer');
    expect(ctx.modules).toEqual(['socle']);
    expect(ctx.doubleAuthentificationExigee).toBe(true);
  });

  it("RG-00-26 change d'école sans se reconnecter, avec les droits de cette école", async () => {
    const reponse = await choisir(ecoleB);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<ContexteSession>()).toMatchObject({
      ecoleActive: { id: ecoleB },
      permissions: [],
      doubleAuthentificationExigee: false,
    });
    expect((await contexte()).ecoleActive?.id).toBe(ecoleB);
    expect((await essai()).statusCode).toBe(403);
    await choisir(ecoleA);
    expect((await essai()).statusCode).toBe(200);
  });

  it("refuse une école où le compte n'a pas de fiche", async () => {
    const reponse = await choisir(ecoleSansFiche);
    expect(reponse.statusCode).toBe(403);
    expect(reponse.json<{ message: string }>().message).toMatch(/pas de fiche/);
  });
});

describe('RG-01-16 et RG-00-11 droits réels, recalculés à chaque requête', () => {
  it('une attribution terminée ne donne plus aucun droit, dès la requête suivante', async () => {
    await choisir(ecoleA);
    expect((await essai()).statusCode).toBe(200);
    await owner.db
      .update(attribution)
      .set({ fin: '2026-01-02' })
      .where(eq(attribution.id, attributionAdmin));
    expect((await essai()).statusCode).toBe(403);
    await owner.db
      .update(attribution)
      .set({ fin: null })
      .where(eq(attribution.id, attributionAdmin));
    expect((await essai()).statusCode).toBe(200);
  });

  it("une fiche mise à la corbeille n'ouvre plus l'école", async () => {
    await owner.db.update(personne).set({ deletedAt: new Date() }).where(eq(personne.id, ficheA));
    expect((await essai()).statusCode).toBe(403);
    expect((await contexte()).ecoles.map((e) => e.id)).toEqual([ecoleB]);
    await owner.db.update(personne).set({ deletedAt: null }).where(eq(personne.id, ficheA));
  });

  it("un compte sans fiche n'a ni école ni droit", async () => {
    await createPasswordAccount(app.get<Auth>(AUTH), {
      email: 'sans.fiche@exemple.test',
      name: 'Sans Fiche',
      password: PASSWORD,
    });
    const autre = await signInCookie(app, 'sans.fiche@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    const ctx = (
      await app.inject({ method: 'GET', url: '/api/session/contexte', headers: { cookie: autre } })
    ).json<ContexteSession>();
    expect(ctx).toEqual({
      ecoleActive: null,
      ecoles: [],
      permissions: [],
      modules: [],
      doubleAuthentificationExigee: false,
      doubleAuthentificationActive: false,
      apparence: null,
      parcours: { apprenant: false, intervenant: false },
    });
  });
});
