import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ListeRoles, type RoleDetail } from '@scolaly/contracts';
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

const PASSWORD = 'phrase de passe des tests des roles';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let scolarite: string;

async function compte(organisationId: string, email: string, code: string) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom: 'Fictif', prenom: 'Noa', email, userId, compteEtat: 'actif' })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
const roles = async (cookie = admin) =>
  (await requete('GET', '/api/roles', cookie)).json<ListeRoles>().roles;
const parCode = async (code: string) => (await roles()).find((r) => r.code === code) as RoleDetail;

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des rôles'],
    [autreEcole, 'Autre école des rôles'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  await compte(ecole, 'admin.roles@exemple.test', 'administrateur');
  await compte(ecole, 'scolarite.roles@exemple.test', 'scolarite');
  await compte(autreEcole, 'admin.autre.roles@exemple.test', 'administrateur');
  admin = await signInCookie(app, 'admin.roles@exemple.test', PASSWORD);
  scolarite = await signInCookie(app, 'scolarite.roles@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-07 rôles et permissions', () => {
  it('RG-01-14 liste les 13 rôles par défaut avec leurs permissions et leurs titulaires', async () => {
    const liste = await roles();
    expect(liste).toHaveLength(13);
    expect(liste[0]).toMatchObject({ code: 'administrateur', verrouille: true, personnes: 1 });
    expect(liste.every((r) => r.parDefaut)).toBe(true);
    expect(liste.find((r) => r.code === 'scolarite')?.permissions).toContain('personnes:lire');
  });

  it('réserve la gestion des rôles aux personnes qui en ont la permission', async () => {
    expect((await requete('GET', '/api/roles', scolarite)).statusCode).toBe(403);
    expect((await requete('POST', '/api/roles', scolarite, { libelle: 'Intrus' })).statusCode).toBe(
      403,
    );
  });

  it('US-01-10 crée un rôle personnalisé en cochant des permissions, trace comprise', async () => {
    const reponse = await requete('POST', '/api/roles', admin, {
      libelle: 'Vie scolaire',
      permissions: ['personnes:lire', 'calendrier:lire'],
    });
    expect(reponse.statusCode).toBe(201);
    const cree = reponse.json<RoleDetail>();
    expect(cree).toMatchObject({
      code: null,
      parDefaut: false,
      verrouille: false,
      doubleAuthentificationRequise: false,
      permissions: ['calendrier:lire', 'personnes:lire'],
    });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, cree.id));
    expect(trace).toMatchObject({ action: 'role.creer', organisationId: ecole });
  });

  it('RG-01-15 duplique un rôle par défaut, avec son exigence de double authentification', async () => {
    const source = await parCode('scolarite');
    const copie = (
      await requete('POST', '/api/roles', admin, {
        libelle: 'Scolarité du campus',
        sourceId: source.id,
        doubleAuthentificationRequise: false,
      })
    ).json<RoleDetail>();
    expect(copie.permissions).toEqual(source.permissions);
    expect(copie.doubleAuthentificationRequise).toBe(true);
    expect(copie.perimetreParDefaut).toBe(source.perimetreParDefaut);
  });

  it('RG-01-16 et RG-00-12 modifie les permissions : effet immédiat, avant et après tracés', async () => {
    const cible = await parCode('scolarite');
    const permissionsDe = async () =>
      (await requete('GET', '/api/session/contexte', scolarite)).json<{ permissions: string[] }>()
        .permissions;
    expect(await permissionsDe()).toContain('personnes:lire');
    const reponse = await requete('PATCH', `/api/roles/${cible.id}`, admin, {
      permissions: cible.permissions.filter((p) => p !== 'personnes:lire'),
    });
    expect(reponse.statusCode).toBe(200);
    expect(await permissionsDe()).not.toContain('personnes:lire');

    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(and(eq(auditEvenement.objetId, cible.id), eq(auditEvenement.action, 'role.modifier')));
    const permissionsTracees = (valeur: unknown) =>
      (valeur as { permissions: string[] }).permissions;
    expect(permissionsTracees(trace?.avant)).toContain('personnes:lire');
    expect(permissionsTracees(trace?.apres)).not.toContain('personnes:lire');
  });

  it('refuse de modifier l’administrateur, une permission inconnue ou l’exigence d’un rôle par défaut', async () => {
    const administrateur = await parCode('administrateur');
    const refus = await requete('PATCH', `/api/roles/${administrateur.id}`, admin, {
      permissions: [],
    });
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toMatch(/garde toutes ses permissions/);

    const direction = await parCode('direction');
    expect(
      (
        await requete('PATCH', `/api/roles/${direction.id}`, admin, {
          permissions: ['notes:pirater'],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await requete('PATCH', `/api/roles/${direction.id}`, admin, {
          doubleAuthentificationRequise: false,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('RG-01-15 supprime un rôle personnalisé inutilisé, jamais un rôle par défaut', async () => {
    const intervenant = await parCode('intervenant');
    expect((await requete('DELETE', `/api/roles/${intervenant.id}`, admin)).statusCode).toBe(409);

    const temporaire = (
      await requete('POST', '/api/roles', admin, { libelle: 'Temporaire' })
    ).json<RoleDetail>();
    const fiche = await compte(ecole, 'titulaire.roles@exemple.test', 'apprenant');
    await owner.db.insert(attribution).values({
      organisationId: ecole,
      personneId: fiche,
      roleId: temporaire.id,
      perimetreType: 'organisation',
      debut: '2026-01-01',
    });
    const encore = await requete('DELETE', `/api/roles/${temporaire.id}`, admin);
    expect(encore.statusCode).toBe(409);
    expect(encore.json<{ message: string }>().message).toMatch(/encore attribué/);

    await owner.db
      .update(attribution)
      .set({ fin: '2026-02-01' })
      .where(eq(attribution.roleId, temporaire.id));
    expect((await requete('DELETE', `/api/roles/${temporaire.id}`, admin)).statusCode).toBe(204);
    expect((await roles()).some((r) => r.id === temporaire.id)).toBe(false);
  });

  it('ne voit ni ne modifie les rôles d’une autre école', async () => {
    const [etranger] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, autreEcole), eq(role.code, 'scolarite')));
    expect(
      (await requete('PATCH', `/api/roles/${etranger?.id}`, admin, { libelle: 'Piraté' }))
        .statusCode,
    ).toBe(404);
  });
});
