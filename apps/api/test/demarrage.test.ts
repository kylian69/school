import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type Demarrage } from '@scolaly/contracts';
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

const PASSWORD = 'phrase de passe des tests du demarrage';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let admin: string;
let direction: string;

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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
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

const demarrage = async () => (await requete('GET', '/api/demarrage')).json<Demarrage>();
const statut = (etat: Demarrage, code: string) => etat.etapes.find((e) => e.code === code);

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École du démarrage', nomAffichage: 'EDD' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  await compte('admin.demarrage@exemple.test', 'administrateur');
  admin = await signInCookie(app, 'admin.demarrage@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-01 liste de démarrage', () => {
  it('US-01-01 part d’une école vide : tout est à faire', async () => {
    const etat = await demarrage();
    expect(etat.etapes.map((e) => [e.code, e.statut])).toEqual([
      ['organisation', 'a-faire'],
      ['calendrier', 'a-faire'],
      ['apparence', 'a-faire'],
      ['roles', 'a-faire'],
    ]);
    expect(etat).toMatchObject({ avancement: 0, termine: false });
    expect(etat.constats).toMatchObject({ roles: 13, personnesAvecRole: 1 });
  });

  it('coche les étapes d’après les données saisies dans les paramètres', async () => {
    await requete('POST', '/api/etablissements', admin, {
      nom: 'Campus du démarrage',
      adresseLigne1: '1 rue Fictive',
      codePostal: '99100',
      ville: 'Lumerac',
    });
    const annee = (
      await requete('POST', '/api/annees', admin, {
        libelle: '2026-2027',
        dateDebut: '2026-09-01',
        dateFin: '2027-08-31',
        periodes: [{ libelle: 'S1', dateDebut: '2026-09-01', dateFin: '2027-01-31' }],
      })
    ).json<{ id: string }>();
    expect(statut(await demarrage(), 'calendrier')?.statut).toBe('a-faire');
    await requete('POST', `/api/annees/${annee.id}/fermetures`, admin, {
      libelle: 'Vacances de la Toussaint',
      dateDebut: '2026-10-24',
      dateFin: '2026-11-01',
      type: 'vacances',
    });
    await requete('PATCH', '/api/apparence', admin, { couleur: '#8C1D40' });

    const etat = await demarrage();
    expect(etat.etapes.slice(0, 3).every((e) => e.statut === 'faite' && e.automatique)).toBe(true);
    expect(etat).toMatchObject({ avancement: 75, termine: false });
  });

  it('chaque étape peut être passée puis reprise, et marquée faite ; tout est tracé', async () => {
    const passee = await requete('PUT', '/api/demarrage/etapes/roles', admin, { choix: 'sautee' });
    expect(passee.json<Demarrage>()).toMatchObject({ termine: true, avancement: 75 });
    const reprise = await requete('PUT', '/api/demarrage/etapes/roles', admin, { choix: null });
    expect(statut(reprise.json<Demarrage>(), 'roles')?.statut).toBe('a-faire');
    const faite = await requete('PUT', '/api/demarrage/etapes/roles', admin, { choix: 'faite' });
    expect(faite.json<Demarrage>()).toMatchObject({ termine: true, avancement: 100 });

    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.organisationId, ecole), eq(auditEvenement.action, 'demarrage.etape')),
      );
    expect(traces.map((t) => t.apres)).toEqual([
      { etape: 'roles', choix: 'sautee' },
      { etape: 'roles', choix: null },
      { etape: 'roles', choix: 'faite' },
    ]);
  });

  it('refuse une étape inconnue, et réserve la liste à l’administration', async () => {
    expect(
      (await requete('PUT', '/api/demarrage/etapes/facturation', admin, { choix: 'faite' }))
        .statusCode,
    ).toBe(400);
    await compte('direction.demarrage@exemple.test', 'direction');
    direction = await signInCookie(app, 'direction.demarrage@exemple.test', PASSWORD);
    expect((await requete('GET', '/api/demarrage', direction)).statusCode).toBe(403);
  });
});
