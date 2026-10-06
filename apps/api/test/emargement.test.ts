import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
  codeDeFenetre,
  fenetreDe,
  genererJeton,
  ROLES_PAR_DEFAUT,
  type AppelEnDirect,
  type OuvertureAppel,
  type ResultatScan,
  type SeanceProche,
} from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
  seance,
  seanceAttendu,
  type Database,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH, DATABASE, VALKEY } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

/** Pool PostgreSQL sous Drizzle, observé pour compter les requêtes. */
interface Pool {
  query: (...args: unknown[]) => unknown;
  connect: (...args: unknown[]) => unknown;
}

const PASSWORD = 'phrase de passe des tests de l’émargement';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const seanceId = newId();
const autreSeanceId = newId();
let intervenant: string;
let autreIntervenant: string;
let lea: string;
let noe: string;
let horsListe: string;

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
      prenom: email.split('.')[0] ?? '',
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
    perimetreType: 'soi',
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
}

const connexion = (email: string) =>
  signInCookie(app, email, PASSWORD, { doubleAuthentification: false });

const appeler = (method: 'GET' | 'POST', url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const ouvrir = async (id = seanceId, cookie = intervenant) => {
  const reponse = await appeler('POST', `/api/seances/${id}/appel/ouverture`, cookie);
  return { statut: reponse.statusCode, ouverture: reponse.json<OuvertureAppel>() };
};

const jetonDe = async (ouverture: OuvertureAppel, instant = Date.now()) =>
  (await genererJeton(Buffer.from(ouverture.cle, 'base64url'), ouverture.seanceId, instant)).jeton;

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de l’émargement', nomAffichage: 'EDE' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const intervenantId = await compte('ines.intervenante@exemple.test', 'intervenant');
  await compte('igor.intervenant@exemple.test', 'intervenant');
  const leaId = await compte('lea.apprenante@exemple.test', 'apprenant');
  const noeId = await compte('noe.apprenant@exemple.test', 'apprenant');
  await compte('hugo.apprenant@exemple.test', 'apprenant');
  const debut = new Date(Date.now() - 60_000);
  for (const id of [seanceId, autreSeanceId]) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: 'Comptabilité générale',
      debut,
      fin: new Date(debut.getTime() + 2 * 3600_000),
      intervenantId,
    });
  }
  for (const personneId of [leaId, noeId]) {
    await owner.db.insert(seanceAttendu).values({ organisationId: ecole, seanceId, personneId });
  }
  intervenant = await connexion('ines.intervenante@exemple.test');
  autreIntervenant = await connexion('igor.intervenant@exemple.test');
  lea = await connexion('lea.apprenante@exemple.test');
  noe = await connexion('noe.apprenant@exemple.test');
  horsListe = await connexion('hugo.apprenant@exemple.test');
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-06-02 émargement par QR, chemin rapide', () => {
  it('refuse le scan tant que l’appel n’est pas ouvert', async () => {
    const { jeton } = await genererJeton(new Uint8Array(32), autreSeanceId, Date.now());
    const reponse = await appeler('POST', '/api/emargement/scan', lea, { jeton });
    expect(reponse.statusCode).toBe(409);
  });

  it('RG-00-18 enregistre la présence sans aucune requête SQL, une seule fois', async () => {
    const { statut, ouverture } = await ouvrir();
    expect(statut).toBe(200);
    expect(ouverture).toMatchObject({
      seanceId,
      libelle: 'Comptabilité générale',
      periodeSecondes: 15,
    });
    const jeton = await jetonDe(ouverture);

    const pool = (app.get<Database>(DATABASE) as unknown as { $client: Pool }).$client;
    let requetes = 0;
    const query = pool.query.bind(pool);
    const connect = pool.connect.bind(pool);
    pool.query = (...args: unknown[]) => {
      requetes++;
      return query(...args);
    };
    pool.connect = (...args: unknown[]) => {
      requetes++;
      return connect(...args);
    };
    let premier: ResultatScan;
    let second: ResultatScan;
    try {
      premier = (
        await appeler('POST', '/api/emargement/scan', lea, { jeton })
      ).json<ResultatScan>();
      second = (await appeler('POST', '/api/emargement/scan', lea, { jeton })).json<ResultatScan>();
    } finally {
      pool.query = query;
      pool.connect = connect;
    }
    expect(requetes).toBe(0);
    expect(premier).toMatchObject({ statut: 'present', retardMinutes: 0, rejoue: false });
    expect(second).toMatchObject({ statut: 'deja-emarge', scanneLe: premier.scanneLe });

    const valkey = app.get<Redis>(VALKEY);
    const flux = await valkey.xrange(CLES_EMARGEMENT.flux, '-', '+');
    const miennes = flux.filter(([, champs]) => champs[1]?.includes(seanceId));
    expect(miennes).toHaveLength(1);
  });

  it('RG-06-05 accepte le code à 6 chiffres et refuse un mauvais code', async () => {
    const { ouverture } = await ouvrir();
    const cle = Buffer.from(ouverture.cle, 'base64url');
    const faux = await appeler('POST', '/api/emargement/code', noe, { seanceId, code: '000000' });
    const vrai = await codeDeFenetre(cle, seanceId, fenetreDe(Date.now()));
    expect(faux.statusCode).toBe(vrai === '000000' ? 200 : 400);
    const reponse = await appeler('POST', '/api/emargement/code', noe, { seanceId, code: vrai });
    expect(reponse.json<ResultatScan>().statut).toMatch(/present|deja-emarge/);
  });

  it('refuse un apprenant non attendu, un QR falsifié ou périmé, et une session absente', async () => {
    const { ouverture } = await ouvrir();
    const jeton = await jetonDe(ouverture);
    expect((await appeler('POST', '/api/emargement/scan', horsListe, { jeton })).statusCode).toBe(
      403,
    );
    const falsifie = `${jeton.slice(0, -2)}xx`;
    expect(
      (await appeler('POST', '/api/emargement/scan', lea, { jeton: falsifie })).statusCode,
    ).toBe(400);
    const perime = await jetonDe(ouverture, Date.now() - 120_000);
    expect((await appeler('POST', '/api/emargement/scan', lea, { jeton: perime })).statusCode).toBe(
      400,
    );
    expect((await appeler('POST', '/api/emargement/scan', '', { jeton })).statusCode).toBe(401);
    expect(
      (await appeler('POST', '/api/emargement/scan', lea, { jeton: 'texte' })).statusCode,
    ).toBe(400);
  });

  it('US-06-03 l’intervenant suit les présents en direct ; un autre intervenant ne peut pas ouvrir', async () => {
    const direct = (
      await appeler('GET', `/api/seances/${seanceId}/appel`, intervenant)
    ).json<AppelEnDirect>();
    expect(direct.attendus).toBe(2);
    expect(direct.presents).toBe(2);
    expect(direct.liste.every((l) => l.scanneLe !== null)).toBe(true);
    expect((await ouvrir(seanceId, autreIntervenant)).statut).toBe(403);
    expect((await ouvrir(seanceId, lea)).statut).toBe(403);
  });

  it('liste les séances à animer de l’intervenant et celles à émarger de l’apprenant', async () => {
    const aAnimer = (await appeler('GET', '/api/seances', intervenant)).json<SeanceProche[]>();
    expect(aAnimer.map((s) => s.id).sort()).toEqual([seanceId, autreSeanceId].sort());
    expect(aAnimer[0]?.intervenant).toBe('ines Fictif');
    expect((await appeler('GET', '/api/seances', autreIntervenant)).json<SeanceProche[]>()).toEqual(
      [],
    );
    const aEmarger = (await appeler('GET', '/api/moi/seances', lea)).json<SeanceProche[]>();
    expect(aEmarger.map((s) => s.id)).toEqual([seanceId]);
    expect((await appeler('GET', '/api/moi/seances', horsListe)).json<SeanceProche[]>()).toEqual(
      [],
    );
    expect((await appeler('GET', '/api/seances', lea)).statusCode).toBe(403);
  });
});
