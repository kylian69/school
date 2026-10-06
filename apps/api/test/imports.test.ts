import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type ApercuImport } from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des imports';
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

const deposer = (
  contenu: Buffer | string,
  type = 'text/csv',
  cookie = admin,
  nom = 'apprenants.csv',
) =>
  app.inject({
    method: 'POST',
    url: `/api/imports?type=apprenants&fichier=${encodeURIComponent(nom)}`,
    headers: { cookie, origin: WEB_ORIGIN, 'content-type': type },
    payload: contenu,
  });

const fiches = async () =>
  (
    await owner.db.select({ n: count() }).from(personne).where(eq(personne.organisationId, ecole))
  )[0]?.n ?? 0;

/**
 * 500 lignes dont 10 erreurs variées (critère d'acceptation du module 01) : nom manquant, email
 * invalide ou répété, date illisible, INE invalide.
 */
function fichier500(): string {
  const lignes = ['Nom;Prénom;Courriel;Né le;INE'];
  for (let n = 1; n <= 500; n++) {
    lignes.push(`Fictif${n};Élève;eleve${n}@exemple.test;14/03/2006;`);
  }
  const erreurs: [number, string][] = [
    [10, ';Sans;nom1@exemple.test;14/03/2006;'],
    [50, 'Fictif;Sans;;14/03/2006;'],
    [90, 'Fictif;Mauvais;pas-un-email;14/03/2006;'],
    [130, 'Fictif;Double;eleve1@exemple.test;14/03/2006;'],
    [170, 'Fictif;Date;date@exemple.test;hier;'],
    [210, 'Fictif;Date;date2@exemple.test;31/02/2006;'],
    [250, 'Fictif;Ine;ine@exemple.test;14/03/2006;12345'],
    [290, ';;sans.prenom@exemple.test;;'],
    [330, 'Fictif;Ine;ine2@exemple.test;14/03/2006;ABCDEFGHIJ1'],
    [370, 'Fictif;Double;eleve2@exemple.test;;'],
  ];
  for (const [rang, ligne] of erreurs) lignes[rang] = ligne;
  return lignes.join('\r\n');
}

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des imports', nomAffichage: 'EDI' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  await compte('admin.imports@exemple.test', 'administrateur');
  await compte('direction.imports@exemple.test', 'direction');
  admin = await signInCookie(app, 'admin.imports@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.imports@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-06 assistant d’import', () => {
  let apercu: ApercuImport;

  it('US-01-05 analyse 500 lignes et montre les 10 erreurs avant toute écriture', async () => {
    const avant = await fiches();
    const reponse = await deposer(fichier500());
    expect(reponse.statusCode).toBe(201);
    apercu = reponse.json<ApercuImport>();
    expect(apercu.correspondance).toEqual({
      Nom: 'nom',
      Prénom: 'prenom',
      Courriel: 'email',
      'Né le': 'dateNaissance',
      INE: 'ine',
    });
    expect(apercu.champsManquants).toEqual([]);
    expect(apercu.totaux).toMatchObject({ lignes: 500, enErreur: 10, valides: 490 });
    const enErreur = apercu.lignes.filter((l) => l.erreurs.length > 0);
    expect(enErreur.map((l) => l.numero)).toEqual([11, 51, 91, 131, 171, 211, 251, 291, 331, 371]);
    expect(enErreur[2]?.erreurs[0]?.message).toBe('Adresse email invalide.');
    // RG-01-18 : rien n'est écrit avant la validation.
    expect(await fiches()).toBe(avant);
  });

  it('RG-01-17 lit un CSV en Windows-1252 séparé par des virgules', async () => {
    const texte = 'NOM,Prénom,Email\r\nGarçon,Zoé,zoe@exemple.test\r\n';
    // Pour ces lettres, Latin-1 et Windows-1252 utilisent les mêmes octets (0xE7, 0xE9).
    const windows1252 = Buffer.from(texte, 'latin1');
    const lu = (await deposer(windows1252)).json<ApercuImport>();
    expect(lu.colonnes).toEqual(['NOM', 'Prénom', 'Email']);
    expect(lu.lignes[0]?.donnees).toMatchObject({ nom: 'Garçon', prenom: 'Zoé' });
  });

  it('RG-01-18 modifie la correspondance, la contrôle et la mémorise pour l’import suivant', async () => {
    const sansIne = await app.inject({
      method: 'PUT',
      url: `/api/imports/${apercu.id}/correspondance`,
      headers: { cookie: admin, origin: WEB_ORIGIN },
      payload: { correspondance: { ...apercu.correspondance, INE: null, Courriel: null } },
    });
    expect(sansIne.statusCode).toBe(200);
    expect(sansIne.json<ApercuImport>()).toMatchObject({
      champsManquants: ['email'],
      correspondance: { INE: null },
    });
    for (const correspondance of [{ Nom: 'nom', Prénom: 'nom' }, { Inconnue: 'nom' }]) {
      const refus = await app.inject({
        method: 'PUT',
        url: `/api/imports/${apercu.id}/correspondance`,
        headers: { cookie: admin, origin: WEB_ORIGIN },
        payload: { correspondance },
      });
      expect(refus.statusCode).toBe(400);
    }
    // Reprise d'un import interrompu, puis import suivant avec les mêmes colonnes.
    const repris = await app.inject({
      method: 'GET',
      url: `/api/imports/${apercu.id}`,
      headers: { cookie: admin },
    });
    expect(repris.json<ApercuImport>().correspondance.Courriel).toBeNull();
    const suivant = (await deposer(fichier500())).json<ApercuImport>();
    expect(suivant.correspondance).toMatchObject({ Courriel: null, INE: null });
  });

  it('RG-01-17 refuse un fichier vide, illisible, trop lourd ou d’un autre format', async () => {
    expect((await deposer('')).statusCode).toBe(400);
    const illisible = await deposer(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      admin,
      'apprenants.xlsx',
    );
    expect(illisible.statusCode).toBe(400);
    expect(illisible.json<{ details: string[] }>().details[0]).toMatch(/illisible/);
    const lourd = await deposer(Buffer.alloc(10 * 1024 * 1024 + 1, 0x41));
    expect(lourd.statusCode).toBe(400);
    expect(lourd.json<{ details: string[] }>().details[0]).toMatch(/10 Mo/);
    expect((await deposer('%PDF-1.7', 'application/pdf')).statusCode).toBe(415);
  });

  it('réserve l’import à qui en a la permission', async () => {
    expect((await deposer('Nom\nA', 'text/csv', direction)).statusCode).toBe(403);
  });
});
