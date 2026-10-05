import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type AttributionPersonne,
  type ListeAttributions,
} from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
  rolePermission,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { aujourdhui } from '../src/shared/dates.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des attributions';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let adminId: string;
let campus: string;
let campusEtranger: string;
const roles = new Map<string, string>();

async function fiche(email: string, avecCompte: boolean) {
  const userId = avecCompte
    ? (
        await createPasswordAccount(app.get<Auth>(AUTH), {
          email,
          name: 'Fictif',
          password: PASSWORD,
        })
      ).userId
    : null;
  const [ligne] = await owner.db
    .insert(personne)
    .values({
      organisationId: ecole,
      nom: 'Fictif',
      prenom: 'Noa',
      email,
      userId,
      compteEtat: avecCompte ? 'actif' : 'cree',
    })
    .returning();
  return ligne?.id ?? '';
}

async function attribuerDirectement(personneId: string, roleId: string) {
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId,
    roleId,
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
}

const requete = (method: 'GET' | 'POST', url: string, cookie = admin, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const attributions = async (personneId: string) =>
  (await requete('GET', `/api/personnes/${personneId}/attributions`)).json<ListeAttributions>()
    .attributions;

const permissionsDe = async (cookie: string) =>
  (await requete('GET', '/api/session/contexte', cookie)).json<{ permissions: string[] }>()
    .permissions;

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des attributions'],
    [autreEcole, 'Autre école des attributions'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  for (const r of await owner.db.select().from(role).where(eq(role.organisationId, ecole))) {
    roles.set(r.code ?? r.libelle, r.id);
  }
  const [local] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus des attributions' })
    .returning();
  campus = local?.id ?? '';
  const [etranger] = await owner.db
    .insert(etablissement)
    .values({ organisationId: autreEcole, nom: 'Campus étranger' })
    .returning();
  campusEtranger = etranger?.id ?? '';
  adminId = await fiche('admin.attributions@exemple.test', true);
  await attribuerDirectement(adminId, roles.get('administrateur') ?? '');
  admin = await signInCookie(app, 'admin.attributions@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-01-09 rôles et périmètres d’une personne', () => {
  let lea: string;
  let leaCookie: string;
  let scolarite: AttributionPersonne;

  it('attribue un rôle sur un établissement ; effet dès la requête suivante (RG-01-16)', async () => {
    lea = await fiche('lea.attributions@exemple.test', true);
    leaCookie = await signInCookie(app, 'lea.attributions@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    expect(await permissionsDe(leaCookie)).toEqual([]);

    const reponse = await requete('POST', `/api/personnes/${lea}/attributions`, admin, {
      roleId: roles.get('direction'),
      perimetreType: 'organisation',
    });
    expect(reponse.statusCode).toBe(201);
    expect(await permissionsDe(leaCookie)).toContain('personnes:lire');

    const surCampus = await requete('POST', `/api/personnes/${lea}/attributions`, admin, {
      roleId: roles.get('scolarite'),
      perimetreType: 'etablissement',
      perimetreId: campus,
    });
    expect(surCampus.statusCode).toBe(201);
    scolarite = surCampus.json<AttributionPersonne>();
    expect(scolarite).toMatchObject({
      roleLibelle: 'Scolarité',
      perimetreLibelle: 'Campus des attributions',
      debut: aujourdhui(),
      fin: null,
      statut: 'en-cours',
    });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(and(eq(auditEvenement.objetId, lea), eq(auditEvenement.action, 'role.attribuer')));
    expect(trace?.apres).toMatchObject({ role: 'Direction', perimetreType: 'organisation' });
  });

  it('refuse un périmètre incohérent, indisponible, d’une autre école, ou un rôle déjà attribué', async () => {
    const cas = [
      [{ perimetreType: 'etablissement' }, 400],
      [{ perimetreType: 'organisation', perimetreId: campus }, 400],
      [{ perimetreType: 'formation', perimetreId: newId() }, 400],
      [{ perimetreType: 'etablissement', perimetreId: campusEtranger }, 400],
      [{ perimetreType: 'organisation', debut: '2026-10-01', fin: '2026-09-01' }, 400],
    ] as const;
    for (const [corps, statut] of cas) {
      const reponse = await requete('POST', `/api/personnes/${lea}/attributions`, admin, {
        roleId: roles.get('intervenant'),
        ...corps,
      });
      expect(reponse.statusCode, JSON.stringify(corps)).toBe(statut);
    }
    const doublon = await requete('POST', `/api/personnes/${lea}/attributions`, admin, {
      roleId: roles.get('scolarite'),
      perimetreType: 'etablissement',
      perimetreId: campus,
    });
    expect(doublon.statusCode).toBe(409);
  });

  it('retire un rôle en cours (terminé ce jour) ou annule un rôle à venir', async () => {
    expect((await requete('POST', `/api/attributions/${scolarite.id}/retrait`)).statusCode).toBe(
      204,
    );
    const avenir = (
      await requete('POST', `/api/personnes/${lea}/attributions`, admin, {
        roleId: roles.get('intervenant'),
        perimetreType: 'organisation',
        debut: '2099-01-01',
      })
    ).json<AttributionPersonne>();
    expect(avenir.statut).toBe('a-venir');
    expect((await requete('POST', `/api/attributions/${avenir.id}/retrait`)).statusCode).toBe(204);

    const liste = await attributions(lea);
    expect(liste.find((a) => a.id === scolarite.id)).toMatchObject({
      statut: 'terminee',
      fin: aujourdhui(),
    });
    expect(liste.some((a) => a.id === avenir.id)).toBe(false);
    expect((await requete('POST', `/api/attributions/${scolarite.id}/retrait`)).statusCode).toBe(
      409,
    );
  });

  it('RG-01-12 ne retire jamais le rôle du dernier administrateur', async () => {
    const [seul] = (await attributions(adminId)).filter((a) => a.statut === 'en-cours');
    const refus = await requete('POST', `/api/attributions/${seul?.id}/retrait`);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toMatch(/dernier administrateur actif/);

    // Avec un second administrateur, le retrait devient possible.
    const second = await fiche('second.attributions@exemple.test', true);
    expect(
      (
        await requete('POST', `/api/personnes/${second}/attributions`, admin, {
          roleId: roles.get('administrateur'),
          perimetreType: 'organisation',
        })
      ).statusCode,
    ).toBe(201);
    const [duSecond] = await attributions(second);
    expect((await requete('POST', `/api/attributions/${duSecond?.id}/retrait`)).statusCode).toBe(
      204,
    );
  });

  it('RG-01-12 réserve le rôle d’administrateur aux administrateurs', async () => {
    const delegue = newId();
    await owner.db
      .insert(role)
      .values({ id: delegue, organisationId: ecole, libelle: 'Délégué aux rôles' });
    await owner.db.insert(rolePermission).values([
      { organisationId: ecole, roleId: delegue, permission: 'roles:attribuer' },
      { organisationId: ecole, roleId: delegue, permission: 'personnes:lire' },
    ]);
    const marc = await fiche('marc.attributions@exemple.test', true);
    await attribuerDirectement(marc, delegue);
    const marcCookie = await signInCookie(app, 'marc.attributions@exemple.test', PASSWORD, {
      doubleAuthentification: false,
    });
    const refus = await requete('POST', `/api/personnes/${lea}/attributions`, marcCookie, {
      roleId: roles.get('administrateur'),
      perimetreType: 'organisation',
    });
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toMatch(/Seul un administrateur/);
  });
});
