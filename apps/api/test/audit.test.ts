import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type JournalAudit, type PersonneDetail } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
  withOrganisation,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { aujourdhui } from '../src/shared/dates.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests du journal';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let adminUserId: string;
let direction: string;
let scolarite: string;
let ines: PersonneDetail;

async function compte(email: string, code: string, prenom: string) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: prenom,
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId: ecole, nom: 'Fictif', prenom, email, userId, compteEtat: 'actif' })
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
  return userId;
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH',
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
const journal = async (filtres = '', cookie = admin) =>
  (await requete('GET', `/api/audit${filtres}`, cookie)).json<JournalAudit>();

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École du journal'],
    [autreEcole, 'Autre école du journal'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  adminUserId = await compte('admin.journal@exemple.test', 'administrateur', 'Alix');
  await compte('direction.journal@exemple.test', 'direction', 'Dana');
  await compte('scolarite.journal@exemple.test', 'scolarite', 'Sam');
  admin = await signInCookie(app, 'admin.journal@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.journal@exemple.test', PASSWORD);
  scolarite = await signInCookie(app, 'scolarite.journal@exemple.test', PASSWORD);
  // Un événement d'une autre école, qui ne doit jamais apparaître.
  await withOrganisation(owner.db, autreEcole, (tx) =>
    tx.insert(auditEvenement).values({ action: 'personne.creer', objetType: 'personne' }),
  );
  ines = (
    await requete('POST', '/api/personnes', admin, {
      nom: 'Benali',
      prenom: 'Inès',
      email: 'ines.journal@exemple.test',
    })
  ).json<PersonneDetail>();
  await requete('PATCH', `/api/personnes/${ines.id}`, admin, {
    version: ines.version,
    telephone: '06 00 00 00 01',
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-08 journal d’audit', () => {
  it('US-01-13 liste les événements du plus récent au plus ancien, avec leur auteur', async () => {
    const { evenements } = await journal('?action=personne.');
    expect(evenements.map((e) => e.action)).toEqual(['personne.modifier', 'personne.creer']);
    expect(evenements[0]).toMatchObject({
      auteur: { id: adminUserId, nom: 'Alix Fictif' },
      objetType: 'personne',
      objetId: ines.id,
    });
    expect(evenements[0]?.avant).toMatchObject({ telephone: null });
    expect(evenements[0]?.apres).toMatchObject({ telephone: '06 00 00 00 01' });
  });

  it('US-01-13 filtre par objet, par auteur et par période', async () => {
    expect((await journal(`?objet=${ines.id}`)).evenements).toHaveLength(2);
    expect((await journal(`?auteur=${adminUserId}&action=personne.`)).evenements).toHaveLength(2);
    expect((await journal(`?auteur=${newId()}`)).evenements).toEqual([]);
    const hier = aujourdhui('Europe/Paris', new Date(Date.now() - 86_400_000));
    expect((await journal(`?au=${hier}&action=personne.`)).evenements).toEqual([]);
    expect(
      (await journal(`?du=${aujourdhui()}&au=${aujourdhui()}&action=personne.`)).evenements,
    ).toHaveLength(2);
  });

  it('pagine par curseur et refuse un curseur falsifié', async () => {
    const premiere = await journal('?action=personne.&parPage=1');
    expect(premiere.evenements[0]?.action).toBe('personne.modifier');
    expect(premiere.suivant).not.toBeNull();
    const seconde = await journal(
      `?action=personne.&parPage=1&curseur=${encodeURIComponent(premiere.suivant ?? '')}`,
    );
    expect(seconde.evenements[0]?.action).toBe('personne.creer');
    expect(seconde.suivant).toBeNull();
    expect((await requete('GET', '/api/audit?curseur=pirate')).statusCode).toBe(400);
  });

  it('exporte le journal filtré en CSV, export lui-même tracé', async () => {
    const reponse = await requete('GET', `/api/audit/export?objet=${ines.id}`);
    expect(reponse.headers['content-type']).toContain('text/csv');
    expect(reponse.body).toContain('"personne.modifier"');
    expect(reponse.body).toContain('"Alix Fictif"');
    expect((await journal('?action=audit.exporter')).evenements).toHaveLength(1);
  });

  it('ouvre le journal à la direction, pas à la scolarité ; jamais celui d’une autre école', async () => {
    const vu = await journal('?action=personne.creer', direction);
    expect(vu.evenements).toHaveLength(1);
    expect((await requete('GET', '/api/audit', scolarite)).statusCode).toBe(403);
  });
});
