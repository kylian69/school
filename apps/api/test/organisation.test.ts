import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type Etablissement, type OrganisationDetail } from '@scolaly/contracts';
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
} from '@scolaly/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de structure';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let direction: string;
let campusEtranger: string;

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
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH',
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

const CAMPUS = {
  nom: 'Campus des Tilleuls',
  adresseLigne1: '12 allée des Tilleuls',
  codePostal: '69000',
  ville: 'Lumerac',
};

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École de la structure'],
    [autreEcole, 'Autre école de la structure'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [etranger] = await owner.db
    .insert(etablissement)
    .values({ organisationId: autreEcole, nom: 'Campus étranger' })
    .returning();
  campusEtranger = etranger?.id ?? '';
  await compte(ecole, 'admin.structure@exemple.test', 'administrateur');
  await compte(ecole, 'direction.structure@exemple.test', 'direction');
  admin = await signInCookie(app, 'admin.structure@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.structure@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-02 organisation et établissements', () => {
  let campus: Etablissement;

  it('US-01-02 crée un établissement avec ses 5 champs obligatoires, trace comprise', async () => {
    const reponse = await requete('POST', '/api/etablissements', admin, CAMPUS);
    expect(reponse.statusCode).toBe(201);
    campus = reponse.json<Etablissement>();
    expect(campus).toMatchObject({
      ...CAMPUS,
      fuseauHoraire: 'Europe/Paris',
      statut: 'actif',
      manquantes: ['uai', 'siret', 'nda'],
    });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, campus.id));
    expect(trace).toMatchObject({ action: 'etablissement.creer', organisationId: ecole });
  });

  it('RG-01-02 normalise et contrôle l’UAI, le SIRET et le NDA', async () => {
    const reponse = await requete('PATCH', `/api/etablissements/${campus.id}`, admin, {
      uai: '0750654d',
      siret: '732 829 320 00074',
      nda: '11755555575',
    });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<Etablissement>()).toMatchObject({
      uai: '0750654D',
      siret: '73282932000074',
      manquantes: [],
    });

    for (const [champ, valeur, message] of [
      ['uai', '0750654E', /la lettre ne correspond pas/],
      ['siret', '73282932000075', /clé de contrôle/],
      ['nda', '1175', /11 chiffres/],
    ] as const) {
      const refus = await requete('PATCH', `/api/etablissements/${campus.id}`, admin, {
        [champ]: valeur,
      });
      expect(refus.statusCode).toBe(400);
      expect(refus.json<{ details: string[] }>().details[0]).toMatch(message);
    }
  });

  it('RG-04-02 paramètre la plage horaire et les jours ouvrés, avant et après tracés', async () => {
    expect(campus.edt).toEqual({
      debut: '08:00',
      fin: '19:00',
      limiteMidi: '13:00',
      joursOuvres: [1, 2, 3, 4, 5],
    });
    const edt = { debut: '07:30', fin: '20:00', limiteMidi: '12:30', joursOuvres: [6, 1, 2] };
    const reponse = await requete('PATCH', `/api/etablissements/${campus.id}`, admin, { edt });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<Etablissement>().edt).toEqual({ ...edt, joursOuvres: [1, 2, 6] });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.objetId, campus.id),
          eq(auditEvenement.action, 'etablissement.modifier'),
          sql`${auditEvenement.apres}->'edt'->>'debut' = '07:30'`,
        ),
      );
    expect(trace?.avant).toMatchObject({ edt: { debut: '08:00', fin: '19:00' } });
    expect(trace?.apres).toMatchObject({ edt: { fin: '20:00', joursOuvres: [1, 2, 6] } });

    for (const [refus, champ] of [
      [{ ...edt, fin: '07:00' }, /^edt\.fin : /],
      [{ ...edt, limiteMidi: '21:00' }, /^edt\.limiteMidi : /],
      [{ ...edt, debut: '08:10' }, /^edt\.debut : .*quart d’heure/],
      [{ ...edt, joursOuvres: [] }, /^edt\.joursOuvres : /],
      [{ ...edt, joursOuvres: [1, 1] }, /^edt\.joursOuvres : /],
    ] as const) {
      const reponseRefus = await requete('PATCH', `/api/etablissements/${campus.id}`, admin, {
        edt: refus,
      });
      expect(reponseRefus.statusCode).toBe(400);
      expect(reponseRefus.json<{ details: string[] }>().details[0]).toMatch(champ);
    }
  });

  it('refuse un établissement sans adresse ou avec un fuseau inconnu', async () => {
    const sansAdresse = await requete('POST', '/api/etablissements', admin, {
      nom: 'Campus incomplet',
    });
    expect(sansAdresse.statusCode).toBe(400);
    const fuseau = await requete('POST', '/api/etablissements', admin, {
      ...CAMPUS,
      fuseauHoraire: 'Europe/Lumerac',
    });
    expect(fuseau.statusCode).toBe(400);
  });

  it('modifie l’organisation et contrôle son SIREN, avant et après tracés', async () => {
    const reponse = await requete('PATCH', '/api/organisation', admin, {
      nomAffichage: 'EDS',
      siren: '732 829 320',
    });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<OrganisationDetail>()).toMatchObject({
      nomAffichage: 'EDS',
      siren: '732829320',
    });
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, ecole), eq(auditEvenement.action, 'organisation.modifier')),
      );
    expect(trace?.avant).toMatchObject({ siren: null });
    expect(trace?.apres).toMatchObject({ siren: '732829320', nomAffichage: 'EDS' });

    expect(
      (await requete('PATCH', '/api/organisation', admin, { siren: '732829321' })).statusCode,
    ).toBe(400);
  });

  it('RG-01-06 paramètre le modèle de matricule, avec un exemple du prochain', async () => {
    const initial = (await requete('GET', '/api/organisation', admin)).json<OrganisationDetail>();
    expect(initial).toMatchObject({ modeleMatricule: '{NUM:6}', exempleMatricule: '000001' });
    const modifie = await requete('PATCH', '/api/organisation', admin, {
      modeleMatricule: '{annee}-{num:4}',
    });
    expect(modifie.statusCode).toBe(200);
    expect(modifie.json<OrganisationDetail>()).toMatchObject({
      modeleMatricule: '{ANNEE}-{NUM:4}',
      exempleMatricule: `${new Date().getFullYear()}-0001`,
    });
    const refus = await requete('PATCH', '/api/organisation', admin, { modeleMatricule: '{ETAB}' });
    expect(refus.statusCode).toBe(400);
    expect(refus.json<{ details: string[] }>().details[0]).toMatch(/^modeleMatricule : /);
  });

  it('RG-01-01 archive un établissement, jamais le dernier actif', async () => {
    const dernier = await requete('POST', `/api/etablissements/${campus.id}/archivage`, admin);
    expect(dernier.statusCode).toBe(409);
    expect(dernier.json<{ message: string }>().message).toMatch(/au moins un établissement actif/);

    const second = (
      await requete('POST', '/api/etablissements', admin, { ...CAMPUS, nom: 'Campus du Port' })
    ).json<Etablissement>();
    const archive = await requete('POST', `/api/etablissements/${campus.id}/archivage`, admin);
    expect(archive.json<Etablissement>().statut).toBe('archive');
    const liste = (await requete('GET', '/api/organisation', admin)).json<OrganisationDetail>();
    expect(liste.etablissements.map((e) => [e.nom, e.statut])).toEqual([
      ['Campus du Port', 'actif'],
      ['Campus des Tilleuls', 'archive'],
    ]);
    const reactive = await requete('POST', `/api/etablissements/${campus.id}/reactivation`, admin);
    expect(reactive.json<Etablissement>().statut).toBe('actif');
    expect(second.statut).toBe('actif');
  });

  it('donne la lecture à la direction, sans modification', async () => {
    expect((await requete('GET', '/api/organisation', direction)).statusCode).toBe(200);
    expect(
      (await requete('PATCH', '/api/organisation', direction, { nomAffichage: 'Pirate' }))
        .statusCode,
    ).toBe(403);
    expect((await requete('POST', '/api/etablissements', direction, CAMPUS)).statusCode).toBe(403);
  });

  it('ne voit ni ne modifie les établissements d’une autre école', async () => {
    const liste = (await requete('GET', '/api/organisation', admin)).json<OrganisationDetail>();
    expect(liste.etablissements.some((e) => e.id === campusEtranger)).toBe(false);
    expect(
      (await requete('PATCH', `/api/etablissements/${campusEtranger}`, admin, { nom: 'Piraté' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await requete('POST', `/api/etablissements/${campusEtranger}/archivage`, admin)).statusCode,
    ).toBe(404);
  });
});
