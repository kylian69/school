import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ContexteSession } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  authUser,
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
import {
  activerDoubleAuthentification,
  emailsEnFile,
  freshIp,
  fusionnerCookies,
  signInCookie,
  startApp,
  WEB_ORIGIN,
} from './helpers.js';

const PASSWORD = 'phrase de passe des tests de securite';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();

async function compte(email: string, code: string) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({
      organisationId: ecole,
      nom: 'Fictif',
      prenom: 'Lou',
      email,
      userId,
      compteEtat: 'actif',
    })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
  return { userId, ficheId: fiche?.id ?? '' };
}

const connexion = (email: string, password = PASSWORD) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
    payload: { email, password },
  });
const contexte = async (cookie: string) =>
  (
    await app.inject({ method: 'GET', url: '/api/session/contexte', headers: { cookie } })
  ).json<ContexteSession>();
const reinitialiser = (ficheId: string, cookie: string) =>
  app.inject({
    method: 'POST',
    url: `/api/comptes/${ficheId}/double-authentification/reinitialisation`,
    headers: { cookie, origin: WEB_ORIGIN },
  });

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de la sécurité', nomAffichage: 'ES' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-01-10 mots de passe', () => {
  it('refuse un mot de passe de la liste des mots de passe compromis, avec un message clair', async () => {
    await expect(
      createPasswordAccount(app.get<Auth>(AUTH), {
        email: 'compromis@exemple.test',
        name: 'Compromis',
        password: 'password1234',
      }),
    ).rejects.toThrow(/mots de passe divulgués/);
  });

  it('applique la même règle au changement de mot de passe', async () => {
    await compte('change.mdp@exemple.test', 'apprenant');
    const cookie = await signInCookie(app, 'change.mdp@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { currentPassword: PASSWORD, newPassword: 'password1234' },
    });
    expect(reponse.statusCode).toBe(400);
    expect(reponse.json<{ message: string }>().message).toMatch(/mots de passe divulgués/);
  });
});

describe('Verrouillage progressif (module 01, section 9)', () => {
  it('après 5 échecs, refuse même le bon mot de passe pendant une minute, compte par compte', async () => {
    await compte('verrou@exemple.test', 'apprenant');
    await compte('voisin.verrou@exemple.test', 'apprenant');
    for (let i = 0; i < 5; i++) {
      expect((await connexion('verrou@exemple.test', 'mauvais mot de passe')).statusCode).toBe(401);
    }
    const bloquee = await connexion('verrou@exemple.test');
    expect(bloquee.statusCode).toBe(429);
    expect(bloquee.json<{ message: string }>().message).toMatch(/Réessayez dans 1 minute/);
    // Le verrou porte sur le compte visé, pas sur les autres.
    expect((await connexion('voisin.verrou@exemple.test')).statusCode).toBe(200);
  });

  it('une adresse inconnue est traitée comme une adresse existante', async () => {
    for (let i = 0; i < 5; i++) await connexion('fantome@exemple.test', 'mauvais mot de passe');
    expect((await connexion('fantome@exemple.test')).statusCode).toBe(429);
  });
});

describe('RG-01-11 et RG-00-13 double authentification', () => {
  it("l'exige pour un rôle qui la requiert, avec un code d'erreur que l'interface reconnaît", async () => {
    const admin = await compte('admin.securite@exemple.test', 'administrateur');
    const cookie = await signInCookie(app, 'admin.securite@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    expect(await contexte(cookie)).toMatchObject({
      doubleAuthentificationExigee: true,
      doubleAuthentificationActive: false,
    });
    const refus = await reinitialiser(admin.ficheId, cookie);
    expect(refus.statusCode).toBe(403);
    expect(refus.json()).toMatchObject({ code: 'DOUBLE_AUTHENTIFICATION_REQUISE' });

    const { cookie: protege, codesDeSecours } = await activerDoubleAuthentification(
      app,
      cookie,
      'admin.securite@exemple.test',
      PASSWORD,
    );
    expect(codesDeSecours).toHaveLength(10);
    expect(await contexte(protege)).toMatchObject({ doubleAuthentificationActive: true });
    expect((await reinitialiser(newId(), protege)).statusCode).toBe(404);
  });

  it('demande ensuite un code à la connexion ; un code de secours ne sert qu’une fois', async () => {
    await compte('codes@exemple.test', 'apprenant');
    const premier = await signInCookie(app, 'codes@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    const { codesDeSecours } = await activerDoubleAuthentification(
      app,
      premier,
      'codes@exemple.test',
      PASSWORD,
    );

    const etape = await connexion('codes@exemple.test');
    expect(etape.json()).toMatchObject({ twoFactorRedirect: true });
    const cookieEtape = fusionnerCookies('', etape.headers['set-cookie']);
    expect(cookieEtape).not.toMatch(/session_token/);

    const verifier = (url: string, code: string, cookie: string) =>
      app.inject({
        method: 'POST',
        url,
        headers: { cookie, origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
        payload: { code },
      });
    expect(
      (await verifier('/api/auth/two-factor/verify-totp', '000000', cookieEtape)).statusCode,
    ).toBe(401);
    const secours = await verifier(
      '/api/auth/two-factor/verify-backup-code',
      codesDeSecours[0] ?? '',
      cookieEtape,
    );
    expect(secours.statusCode).toBe(200);
    expect(fusionnerCookies('', secours.headers['set-cookie'])).toMatch(/session_token/);

    const encore = fusionnerCookies(
      '',
      (await connexion('codes@exemple.test')).headers['set-cookie'],
    );
    expect(
      (await verifier('/api/auth/two-factor/verify-backup-code', codesDeSecours[0] ?? '', encore))
        .statusCode,
    ).not.toBe(200);
  });

  it("n'envoie pas de lien magique à un compte protégé (il contournerait le code)", async () => {
    await compte('magique.protege@exemple.test', 'apprenant');
    await signInCookie(app, 'magique.protege@exemple.test', PASSWORD);
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: WEB_ORIGIN, 'x-forwarded-for': freshIp() },
      payload: { email: 'magique.protege@exemple.test' },
    });
    expect(reponse.statusCode).toBe(200);
    expect((await emailsEnFile()).some((e) => e.to === 'magique.protege@exemple.test')).toBe(false);
  });

  it('un administrateur la réinitialise : trace d’audit, sessions fermées, nouvelle mise en place', async () => {
    await compte('admin.reinit@exemple.test', 'administrateur');
    const perdu = await compte('perdu@exemple.test', 'scolarite');
    const cookieAdmin = await signInCookie(app, 'admin.reinit@exemple.test', PASSWORD);
    const cookiePerdu = await signInCookie(app, 'perdu@exemple.test', PASSWORD);

    expect((await reinitialiser(perdu.ficheId, cookiePerdu)).statusCode).toBe(403);
    expect((await reinitialiser(perdu.ficheId, cookieAdmin)).statusCode).toBe(204);

    const [etat] = await owner.db
      .select({ actif: authUser.twoFactorEnabled })
      .from(authUser)
      .where(eq(authUser.id, perdu.userId));
    expect(etat?.actif).toBe(false);
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookiePerdu },
    });
    expect(session.json()).toBeNull();
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, perdu.ficheId));
    expect(traces.map((t) => t.action)).toContain('compte.reinitialiser-double-authentification');

    // La personne se reconnecte avec son seul mot de passe, puis doit la remettre en place.
    const retour = await connexion('perdu@exemple.test');
    expect(retour.json()).not.toHaveProperty('twoFactorRedirect');
    expect(await contexte(fusionnerCookies('', retour.headers['set-cookie']))).toMatchObject({
      doubleAuthentificationExigee: true,
      doubleAuthentificationActive: false,
    });
  });
});
