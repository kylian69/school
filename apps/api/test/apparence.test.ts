import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ApparenceEcole, type ContexteSession } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
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
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de l apparence';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let scolarite: string;

/** PNG minimal : signature, puis des octets quelconques (seule la signature est contrôlée). */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#4F46E5"/></svg>';

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
      prenom: 'Noa',
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
}

const requete = (
  method: 'GET' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const deposer = (contenu: Buffer | string, type: string, cookie = admin) =>
  app.inject({
    method: 'PUT',
    url: '/api/apparence/logo',
    headers: { cookie, origin: WEB_ORIGIN, 'content-type': type },
    payload: contenu,
  });

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École de l’apparence'],
    [autreEcole, 'Autre école de l’apparence'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  await compte('admin.apparence@exemple.test', 'administrateur');
  await compte('scolarite.apparence@exemple.test', 'scolarite');
  admin = await signInCookie(app, 'admin.apparence@exemple.test', PASSWORD);
  scolarite = await signInCookie(app, 'scolarite.apparence@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-09 apparence', () => {
  it('part de l’apparence de Scolaly : ni couleur, ni logo', async () => {
    const reponse = await requete('GET', '/api/apparence', admin);
    expect(reponse.json<ApparenceEcole>()).toEqual({
      nomAffichage: 'Éco',
      couleur: null,
      palette: null,
      logoUrl: null,
    });
  });

  it('RG-01-24 refuse une couleur peu contrastée et propose une teinte proche', async () => {
    const refus = await requete('PATCH', '/api/apparence', admin, { couleur: '#FFD700' });
    expect(refus.statusCode).toBe(400);
    const corps = refus.json<{ details: string[]; proposition: string }>();
    expect(corps.details[0]).toMatch(/^couleur : Cette couleur n’est pas assez contrastée/);
    expect(corps.proposition).toMatch(/^#[0-9A-F]{6}$/);
    const accepte = await requete('PATCH', '/api/apparence', admin, {
      couleur: corps.proposition,
    });
    expect(accepte.statusCode).toBe(200);
    expect((await requete('PATCH', '/api/apparence', admin, { couleur: 'bleu' })).statusCode).toBe(
      400,
    );
  });

  it('US-01-14 enregistre le nom affiché et la couleur, palette et trace comprises', async () => {
    const reponse = await requete('PATCH', '/api/apparence', admin, {
      nomAffichage: 'EDA',
      couleur: '#0b6b66',
    });
    const apparence = reponse.json<ApparenceEcole>();
    expect(apparence).toMatchObject({ nomAffichage: 'EDA', couleur: '#0B6B66' });
    expect(apparence.palette?.clair.accent).toBe('#0B6B66');
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, ecole), eq(auditEvenement.action, 'apparence.modifier')),
      );
    expect(traces.at(-1)?.apres).toEqual({ nomAffichage: 'EDA', couleur: '#0B6B66' });

    // L'apparence suit la session : l'interface l'applique dès la requête suivante.
    const contexte = (
      await requete('GET', '/api/session/contexte', scolarite)
    ).json<ContexteSession>();
    expect(contexte.apparence).toMatchObject({ nomAffichage: 'EDA', couleur: '#0B6B66' });
  });

  it('US-01-14 dépose un logo PNG, servi publiquement et mis en cache par version', async () => {
    const reponse = await deposer(PNG, 'image/png');
    expect(reponse.statusCode).toBe(200);
    const { logoUrl } = reponse.json<ApparenceEcole>();
    expect(logoUrl).toMatch(new RegExp(`^/api/ecoles/${ecole}/logo\\?v=[0-9a-f]{16}$`));

    const logo = await app.inject({ method: 'GET', url: logoUrl ?? '' });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['cache-control']).toContain('immutable');
    expect(logo.headers['content-security-policy']).toContain('sandbox');
    expect(logo.rawPayload.equals(PNG)).toBe(true);
  });

  it('RG-01-24 accepte un SVG autonome, refuse un SVG scripté, trop lourd ou d’un autre format', async () => {
    const svg = await deposer(SVG, 'image/svg+xml');
    expect(svg.statusCode).toBe(200);
    const { logoUrl } = svg.json<ApparenceEcole>();
    const logo = await app.inject({ method: 'GET', url: logoUrl ?? '' });
    expect(logo.headers['content-type']).toBe('image/svg+xml');

    const scripte = await deposer(
      SVG.replace('<rect', '<script>alert(1)</script><rect'),
      'image/svg+xml',
    );
    expect(scripte.statusCode).toBe(400);
    expect(scripte.json<{ details: string[] }>().details[0]).toMatch(/script ou des ressources/);

    const lourd = await deposer(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'image/png');
    expect(lourd.statusCode).toBe(400);
    expect(lourd.json<{ details: string[] }>().details[0]).toMatch(/dépasse 2 Mo/);

    // Un fichier qui n'est pas ce qu'il prétend être est refusé sur sa signature.
    const deguise = await deposer(Buffer.from('pas une image'), 'image/png');
    expect(deguise.statusCode).toBe(400);
  });

  it('retire le logo, et réserve l’apparence à qui en a la permission', async () => {
    const retrait = await requete('DELETE', '/api/apparence/logo', admin);
    expect(retrait.json<ApparenceEcole>().logoUrl).toBeNull();
    expect((await app.inject({ method: 'GET', url: `/api/ecoles/${ecole}/logo` })).statusCode).toBe(
      404,
    );
    expect((await requete('GET', '/api/apparence', scolarite)).statusCode).toBe(403);
    expect((await deposer(PNG, 'image/png', scolarite)).statusCode).toBe(403);
  });

  it('ne sert aucun logo pour une école qui n’en a pas', async () => {
    const reponse = await app.inject({ method: 'GET', url: `/api/ecoles/${autreEcole}/logo` });
    expect(reponse.statusCode).toBe(404);
  });
});
