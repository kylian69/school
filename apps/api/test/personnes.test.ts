import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type DoublonPersonne,
  type ListePersonnes,
  type PersonneDetail,
} from '@scolaly/contracts';
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

const PASSWORD = 'phrase de passe des tests des personnes';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let direction: string;
let intervenant: string;
let intervenantId: string;
let etrangere: string;

async function compte(
  organisationId: string,
  email: string,
  code: string,
  nom = 'Fictif',
  perimetreType: 'organisation' | 'formation' = 'organisation',
) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: nom,
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom, prenom: 'Noa', email, userId, compteEtat: 'actif' })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType,
    perimetreId: perimetreType === 'formation' ? newId() : null,
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
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

const INES = {
  civilite: 'madame',
  nom: 'Benali',
  prenom: 'Inès',
  email: 'ines.benali@exemple.test',
  dateNaissance: '2006-03-14',
  lieuNaissance: 'Lumerac',
  telephone: '06 00 00 00 01',
};

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des personnes'],
    [autreEcole, 'Autre école des personnes'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  await compte(ecole, 'admin.personnes@exemple.test', 'administrateur', 'Admin');
  await compte(ecole, 'direction.personnes@exemple.test', 'direction', 'Direction');
  intervenantId = await compte(
    ecole,
    'pedagogie.personnes@exemple.test',
    'responsable-pedagogique',
    'Zola',
    'formation',
  );
  etrangere = await compte(autreEcole, 'etrangere.personnes@exemple.test', 'apprenant', 'Ailleurs');
  admin = await signInCookie(app, 'admin.personnes@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.personnes@exemple.test', PASSWORD);
  intervenant = await signInCookie(app, 'pedagogie.personnes@exemple.test', PASSWORD, {
    doubleAuthentification: false,
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-04 et E-01-05 personnes', () => {
  let ines: PersonneDetail;

  it('crée une fiche avec son identité, trace comprise', async () => {
    const reponse = await requete('POST', '/api/personnes', admin, INES);
    expect(reponse.statusCode).toBe(201);
    ines = reponse.json<PersonneDetail>();
    expect(ines).toMatchObject({ ...INES, compteEtat: 'cree', naissanceVisible: true, roles: [] });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, ines.id));
    expect(trace).toMatchObject({ action: 'personne.creer', organisationId: ecole });
  });

  it('RG-01-07 propose la fiche existante : même email, ou même identité', async () => {
    const memeEmail = await requete('POST', '/api/personnes', admin, {
      ...INES,
      email: 'INES.BENALI@exemple.test',
      dateNaissance: null,
      ignorerDoublons: true,
    });
    expect(memeEmail.statusCode).toBe(409);
    expect(memeEmail.json<{ doublons: DoublonPersonne[] }>().doublons).toEqual([
      expect.objectContaining({ id: ines.id, motifs: ['email'] }),
    ]);

    const memeIdentite = { ...INES, prenom: 'ines', email: 'ines.b@exemple.test' };
    const refus = await requete('POST', '/api/personnes', admin, memeIdentite);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ doublons: DoublonPersonne[] }>().doublons[0]?.motifs).toEqual(['identite']);
    // Après vérification, la création reste possible (homonymes nés le même jour).
    const confirmee = await requete('POST', '/api/personnes', admin, {
      ...memeIdentite,
      ignorerDoublons: true,
    });
    expect(confirmee.statusCode).toBe(201);
  });

  it('refuse une date de naissance improbable', async () => {
    const reponse = await requete('POST', '/api/personnes', admin, {
      ...INES,
      email: 'futur@exemple.test',
      dateNaissance: '2999-01-01',
    });
    expect(reponse.statusCode).toBe(400);
    expect(reponse.json<{ details: string[] }>().details[0]).toMatch(/^dateNaissance : /);
  });

  it('modifie la fiche, avant et après tracés ; une version dépassée est refusée', async () => {
    const reponse = await requete('PATCH', `/api/personnes/${ines.id}`, admin, {
      version: ines.version,
      nomUsage: 'Morel',
      ville: 'Lumerac',
    });
    expect(reponse.statusCode).toBe(200);
    const apres = reponse.json<PersonneDetail>();
    expect(apres).toMatchObject({ nomUsage: 'Morel', ville: 'Lumerac', nom: 'Benali' });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, ines.id), eq(auditEvenement.action, 'personne.modifier')),
      );
    expect(trace?.avant).toMatchObject({ nomUsage: null });
    expect(trace?.apres).toMatchObject({ nomUsage: 'Morel' });

    // Section 7 : deux modifications simultanées, la seconde est refusée avec la version actuelle.
    const perimee = await requete('PATCH', `/api/personnes/${ines.id}`, admin, {
      version: ines.version,
      nomUsage: 'Autre',
    });
    expect(perimee.statusCode).toBe(409);
    expect(perimee.json<{ actuelle: PersonneDetail }>().actuelle.nomUsage).toBe('Morel');

    const emailPris = await requete('PATCH', `/api/personnes/${ines.id}`, admin, {
      version: apres.version,
      email: 'direction.personnes@exemple.test',
    });
    expect(emailPris.statusCode).toBe(400);
  });

  it('liste, cherche et filtre les personnes, avec leurs rôles, page par page', async () => {
    const tout = (await requete('GET', '/api/personnes')).json<ListePersonnes>();
    expect(tout.total).toBe(5);
    expect(tout.personnes.map((p) => p.nom)).toEqual([
      'Admin',
      'Benali',
      'Benali',
      'Direction',
      'Zola',
    ]);
    expect(tout.personnes[0]?.roles).toEqual(['Administrateur d’organisation']);

    const cherche = (await requete('GET', '/api/personnes?q=morel')).json<ListePersonnes>();
    expect(cherche.personnes.map((p) => p.id)).toEqual([ines.id]);
    const crees = (await requete('GET', '/api/personnes?etat=cree')).json<ListePersonnes>();
    expect(crees.total).toBe(2);
    const [roleIntervenant] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'responsable-pedagogique')));
    const parRole = (
      await requete('GET', `/api/personnes?role=${roleIntervenant?.id}`)
    ).json<ListePersonnes>();
    expect(parRole.personnes.map((p) => p.id)).toEqual([intervenantId]);
    const page2 = (await requete('GET', '/api/personnes?parPage=2&page=2')).json<ListePersonnes>();
    expect(page2).toMatchObject({ total: 5, page: 2, parPage: 2 });
    expect(page2.personnes.map((p) => p.nom)).toEqual(['Benali', 'Direction']);
  });

  it('montre la naissance à l’administration seulement ; la direction lit sans modifier', async () => {
    const vue = (
      await requete('GET', `/api/personnes/${ines.id}`, direction)
    ).json<PersonneDetail>();
    expect(vue).toMatchObject({
      naissanceVisible: false,
      dateNaissance: null,
      lieuNaissance: null,
    });
    expect(
      (await requete('PATCH', `/api/personnes/${ines.id}`, direction, { version: vue.version }))
        .statusCode,
    ).toBe(403);
    expect((await requete('POST', '/api/personnes', direction, INES)).statusCode).toBe(403);
  });

  it('un périmètre restreint ne voit que sa propre fiche ; aucune fiche d’une autre école', async () => {
    const liste = (await requete('GET', '/api/personnes', intervenant)).json<ListePersonnes>();
    expect(liste.personnes.map((p) => p.id)).toEqual([intervenantId]);
    expect((await requete('GET', `/api/personnes/${ines.id}`, intervenant)).statusCode).toBe(404);
    expect((await requete('GET', `/api/personnes/${etrangere}`)).statusCode).toBe(404);
  });
});
