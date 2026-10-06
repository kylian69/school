import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ContexteSession } from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { emailsEnFile, freshIp, signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'mot de passe des tests de comptes';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();

async function compte(email: string, codes: Record<string, string>) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const fiches: Record<string, string> = {};
  for (const [organisationId, code] of Object.entries(codes)) {
    const [fiche] = await owner.db
      .insert(personne)
      .values({ organisationId, nom: 'Fictif', prenom: 'Sam', email, userId, compteEtat: 'actif' })
      .returning();
    const [leRole] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
    await owner.db.insert(attribution).values({
      organisationId,
      personneId: fiche?.id ?? '',
      roleId: leRole?.id ?? '',
      perimetreType: code === 'scolarite' ? 'organisation' : 'organisation',
      debut: '2026-01-01',
    });
    fiches[organisationId] = fiche?.id ?? '';
  }
  return { userId, fiches };
}

const post = (url: string, cookie: string) =>
  app.inject({ method: 'POST', url, headers: { cookie, origin: WEB_ORIGIN } });
const session = async (cookie: string) =>
  (
    await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  ).json<unknown>();
const connexion = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
    payload: { email, password: PASSWORD },
  });

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des comptes'],
    [autreEcole, 'Autre école des comptes'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-01-12 désactivation et réactivation (RG-01-09, RG-01-13)', () => {
  it('désactive un compte : sessions révoquées, connexion refusée ; la réactivation rétablit tout', async () => {
    const admin = await compte('admin.comptes@exemple.test', { [ecole]: 'administrateur' });
    const cible = await compte('cible.comptes@exemple.test', { [ecole]: 'apprenant' });
    const cookieAdmin = await signInCookie(app, 'admin.comptes@exemple.test', PASSWORD);
    const cookieCible = await signInCookie(app, 'cible.comptes@exemple.test', PASSWORD);
    expect(await session(cookieCible)).not.toBeNull();

    expect(
      (await post(`/api/comptes/${cible.fiches[ecole]}/desactivation`, cookieAdmin)).statusCode,
    ).toBe(204);
    expect(await session(cookieCible)).toBeNull();
    expect((await connexion('cible.comptes@exemple.test')).statusCode).not.toBe(200);
    expect(
      (await post(`/api/comptes/${cible.fiches[ecole]}/desactivation`, cookieAdmin)).statusCode,
    ).toBe(409);

    expect(
      (await post(`/api/comptes/${cible.fiches[ecole]}/reactivation`, cookieAdmin)).statusCode,
    ).toBe(204);
    expect((await connexion('cible.comptes@exemple.test')).statusCode).toBe(200);
    expect(admin.userId).toBeTruthy();
  });

  it('dans une seule de ses écoles : la session reste ouverte, cette école disparaît', async () => {
    await compte('admin2.comptes@exemple.test', { [autreEcole]: 'administrateur' });
    const partage = await compte('partage.comptes@exemple.test', {
      [ecole]: 'apprenant',
      [autreEcole]: 'apprenant',
    });
    const cookieAdmin = await signInCookie(app, 'admin2.comptes@exemple.test', PASSWORD);
    const cookie = await signInCookie(app, 'partage.comptes@exemple.test', PASSWORD);
    await post(`/api/comptes/${partage.fiches[autreEcole]}/desactivation`, cookieAdmin);
    expect(await session(cookie)).not.toBeNull();
    const contexte = (
      await app.inject({ method: 'GET', url: '/api/session/contexte', headers: { cookie } })
    ).json<ContexteSession>();
    expect(contexte.ecoles.map((e) => e.id)).toEqual([ecole]);
  });

  it('RG-01-12 protège le dernier administrateur et réserve ce changement aux administrateurs', async () => {
    const seul = newId();
    await owner.db
      .insert(organisation)
      .values({ id: seul, nom: 'École à un administrateur', nomAffichage: 'E1A' });
    await initialiserRolesParDefaut(owner.db, seul, ROLES_PAR_DEFAUT);
    const admin = await compte('seul.admin@exemple.test', { [seul]: 'administrateur' });
    const cookieAdmin = await signInCookie(app, 'seul.admin@exemple.test', PASSWORD);
    const dernier = await post(`/api/comptes/${admin.fiches[seul]}/desactivation`, cookieAdmin);
    expect(dernier.statusCode).toBe(409);
    expect(dernier.json<{ message: string }>().message).toMatch(/dernier administrateur/);

    await compte('scolarite.seul@exemple.test', { [seul]: 'scolarite' });
    const cookieScolarite = await signInCookie(app, 'scolarite.seul@exemple.test', PASSWORD);
    const reserve = await post(`/api/comptes/${admin.fiches[seul]}/desactivation`, cookieScolarite);
    expect(reserve.statusCode).toBe(409);
    expect(reserve.json<{ message: string }>().message).toMatch(/Seul un administrateur/);
  });
});

describe('US-01-08 lien magique (RG-01-10)', () => {
  const demander = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
      payload: { email, callbackURL: '/' },
    });

  it('envoie un lien à usage unique à un compte existant, et répond pareil pour une adresse inconnue', async () => {
    await compte('magique@exemple.test', { [ecole]: 'apprenant' });
    const connu = await demander('magique@exemple.test');
    const inconnu = await demander('personne.inconnue@exemple.test');
    expect(connu.statusCode).toBe(200);
    expect(inconnu.statusCode).toBe(200);
    expect(inconnu.json()).toEqual(connu.json());

    const emails = await emailsEnFile();
    expect(emails.some((e) => e.to === 'personne.inconnue@exemple.test')).toBe(false);
    const email = emails.findLast((e) => e.to === 'magique@exemple.test');
    expect(email?.subject).toBe('Votre lien de connexion à Scolaly');
    const lien = /(http\S+magic-link\/verify\S+)/.exec(email?.text ?? '')?.[1] ?? '';
    const url = new URL(lien);

    const premier = await app.inject({ method: 'GET', url: url.pathname + url.search });
    expect(
      [...[premier.headers['set-cookie'] ?? []].flat()].some((c) => c.includes('session_token=')),
    ).toBe(true);
    const second = await app.inject({ method: 'GET', url: url.pathname + url.search });
    expect(
      [...[second.headers['set-cookie'] ?? []].flat()].some(
        (c) => /session_token=[^;]+/.test(c) && !c.includes('Max-Age=0'),
      ),
    ).toBe(false);
  });
});
