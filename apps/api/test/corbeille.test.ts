import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type CalendrierAnnee,
  type Corbeille,
  type PersonneDetail,
  type RoleDetail,
} from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de la corbeille';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let admin: string;
let scolarite: string;
let direction: string;
let adminId: string;

async function compte(email: string, code: string, perimetre: 'organisation' | 'etablissement') {
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
    perimetreType: perimetre,
    perimetreId: perimetre === 'etablissement' ? newId() : null,
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
}

const requete = (
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  cookie = admin,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });
const corbeille = async (cookie = admin) =>
  (await requete('GET', '/api/corbeille', cookie)).json<Corbeille>().elements;
const restaurer = (type: string, id: string) =>
  requete('POST', `/api/corbeille/${type}/${id}/restauration`);

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de la corbeille', nomAffichage: 'EDC' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  adminId = await compte('admin.corbeille@exemple.test', 'administrateur', 'organisation');
  await compte('scolarite.corbeille@exemple.test', 'scolarite', 'etablissement');
  await compte('direction.corbeille@exemple.test', 'direction', 'organisation');
  admin = await signInCookie(app, 'admin.corbeille@exemple.test', PASSWORD);
  scolarite = await signInCookie(app, 'scolarite.corbeille@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.corbeille@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-10 corbeille', () => {
  it('US-01-16 supprime une fiche avec ses rôles, puis la restaure à l’identique', async () => {
    const ines = (
      await requete('POST', '/api/personnes', admin, {
        nom: 'Benali',
        prenom: 'Inès',
        email: 'ines.corbeille@exemple.test',
      })
    ).json<PersonneDetail>();
    const [apprenant] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'apprenant')));
    await requete('POST', `/api/personnes/${ines.id}/attributions`, admin, {
      roleId: apprenant?.id,
      perimetreType: 'soi',
    });
    expect((await requete('DELETE', `/api/personnes/${ines.id}`)).statusCode).toBe(204);
    expect((await requete('GET', `/api/personnes/${ines.id}`)).statusCode).toBe(404);

    const [element] = (await corbeille()).filter((e) => e.id === ines.id);
    expect(element).toMatchObject({
      type: 'personne',
      libelle: 'Inès Benali',
      supprimePar: 'Noa Fictif',
      lies: 1,
    });
    const delai = Date.parse(element?.effacementLe ?? '') - Date.parse(element?.supprimeLe ?? '');
    expect(delai).toBe(30 * 86_400_000);

    expect((await restaurer('personne', ines.id)).statusCode).toBe(204);
    const restauree = (await requete('GET', `/api/personnes/${ines.id}`)).json<PersonneDetail>();
    expect(restauree).toMatchObject({ matricule: ines.matricule, roles: ['Apprenant'] });
    expect((await corbeille()).some((e) => e.id === ines.id)).toBe(false);
  });

  it('refuse de supprimer une fiche dont le compte a été activé', async () => {
    const refus = await requete('DELETE', `/api/personnes/${adminId}`);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toMatch(/Désactivez son compte/);
  });

  it('RG-01-23 restaure une année avec ses périodes et ses fermetures, puis un rôle', async () => {
    const annee = (
      await requete('POST', '/api/annees', admin, {
        libelle: '2030-2031',
        dateDebut: '2030-09-01',
        dateFin: '2031-08-31',
        periodes: [{ libelle: 'S1', dateDebut: '2030-09-01', dateFin: '2031-01-31' }],
        fermetures: [
          {
            libelle: 'Toussaint',
            dateDebut: '2030-10-26',
            dateFin: '2030-11-03',
            type: 'vacances',
          },
        ],
      })
    ).json<CalendrierAnnee>();
    await requete('DELETE', `/api/annees/${annee.id}`);
    const element = (await corbeille()).find((e) => e.id === annee.id);
    expect(element).toMatchObject({ type: 'annee', libelle: '2030-2031', lies: 2 });
    expect((await restaurer('annee', annee.id)).statusCode).toBe(204);
    const restauree = (await requete('GET', `/api/annees/${annee.id}`)).json<CalendrierAnnee>();
    expect(restauree.periodes).toHaveLength(1);
    expect(restauree.fermetures).toHaveLength(1);

    const temporaire = (
      await requete('POST', '/api/roles', admin, { libelle: 'Temporaire' })
    ).json<RoleDetail>();
    await requete('DELETE', `/api/roles/${temporaire.id}`);
    expect((await restaurer('role', temporaire.id)).statusCode).toBe(204);
    const [revenu] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.id, temporaire.id), isNull(role.deletedAt)));
    expect(revenu?.libelle).toBe('Temporaire');
  });

  it('refuse de restaurer une fiche dont l’email a été repris entre-temps', async () => {
    const leo = (
      await requete('POST', '/api/personnes', admin, {
        nom: 'Morel',
        prenom: 'Léo',
        email: 'leo.corbeille@exemple.test',
      })
    ).json<PersonneDetail>();
    await requete('DELETE', `/api/personnes/${leo.id}`);
    await requete('POST', '/api/personnes', admin, {
      nom: 'Morel',
      prenom: 'Léon',
      email: 'leo.corbeille@exemple.test',
    });
    const refus = await restaurer('personne', leo.id);
    expect(refus.statusCode).toBe(409);
  });

  it('montre à la scolarité ses seules suppressions ; ferme la corbeille à la direction', async () => {
    expect(await corbeille(scolarite)).toEqual([]);
    expect((await requete('GET', '/api/corbeille', direction)).statusCode).toBe(403);
    expect((await restaurer('personne', newId())).statusCode).toBe(404);
  });
});
