import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
  PREFIXE_SESSIONS,
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
  inscrireManquants,
  newId,
  organisation,
  personne,
  presence,
  promotionTechnique,
  role,
  seance,
  seanceIntervenant,
  seancePublic,
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
const seanceDegradeeId = newId();
let intervenant: string;
let igorId: string;
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
  igorId = await compte('igor.intervenant@exemple.test', 'intervenant');
  const leaId = await compte('lea.apprenante@exemple.test', 'apprenant');
  const noeId = await compte('noe.apprenant@exemple.test', 'apprenant');
  await compte('hugo.apprenant@exemple.test', 'apprenant');
  const debut = new Date(Date.now() - 60_000);
  for (const id of [seanceId, autreSeanceId, seanceDegradeeId]) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: 'Comptabilité générale',
      debut,
      fin: new Date(debut.getTime() + 2 * 3600_000),
    });
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId: id, personneId: intervenantId });
  }
  // Attendus calculés : Léa et Noé inscrits à la séance principale, Léa seule à la séance dégradée.
  const lesDeux = await promotionTechnique(owner.db, ecole, 'Promotion Léa et Noé');
  const leaSeule = await promotionTechnique(owner.db, ecole, 'Promotion Léa');
  await inscrireManquants(owner.db, ecole, lesDeux, [leaId, noeId]);
  await inscrireManquants(owner.db, ecole, leaSeule, [leaId]);
  await owner.db.insert(seancePublic).values([
    { organisationId: ecole, seanceId, promotionId: lesDeux },
    { organisationId: ecole, seanceId: seanceDegradeeId, promotionId: leaSeule },
  ]);
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

  it('RG-00-17 remet en cache à l’ouverture une session sortie du cache : le scan reste sans SQL', async () => {
    const valkey = app.get<Redis>(VALKEY);
    const jetonSession =
      decodeURIComponent(lea.split('session_token=')[1]?.split(';')[0] ?? '').split('.')[0] ?? '';
    await valkey.del(PREFIXE_SESSIONS + jetonSession);
    const { ouverture } = await ouvrir();
    expect(await valkey.exists(PREFIXE_SESSIONS + jetonSession)).toBe(1);
    const pool = (app.get<Database>(DATABASE) as unknown as { $client: Pool }).$client;
    let requetes = 0;
    const query = pool.query.bind(pool);
    pool.query = (...args: unknown[]) => {
      requetes++;
      return query(...args);
    };
    try {
      const reponse = await appeler('POST', '/api/emargement/scan', lea, {
        jeton: await jetonDe(ouverture),
      });
      expect(reponse.statusCode).toBe(200);
    } finally {
      pool.query = query;
    }
    expect(requetes).toBe(0);
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

  it('ADR 0006 après la bascule de clé maîtresse, un appel ouvert avant reste valable', async () => {
    const { ouverture: avant } = await ouvrir();
    const apres = await startApp({
      chiffrement: {
        masterKeys: new Map([
          [1, Buffer.alloc(32, 1)],
          [2, Buffer.alloc(32, 2)],
        ]),
        currentVersion: 2,
      },
    });
    try {
      const scanner = (payload: Record<string, unknown>, url = '/api/emargement/scan') =>
        apres.inject({
          method: 'POST',
          url,
          headers: { cookie: lea, origin: WEB_ORIGIN },
          payload,
        });
      // QR et code issus de la clé v1 : vérifiés avec la v2 puis avec la v1.
      const scan = await scanner({ jeton: await jetonDe(avant) });
      expect(scan.json<ResultatScan>().statut).toMatch(/present|deja-emarge/);
      const code = await codeDeFenetre(
        Buffer.from(avant.cle, 'base64url'),
        seanceId,
        fenetreDe(Date.now()),
      );
      const parCode = await scanner({ seanceId, code }, '/api/emargement/code');
      expect(parCode.json<ResultatScan>().statut).toMatch(/present|deja-emarge/);
      // Les nouveaux appels utilisent la clé courante (v2).
      const nouvelle = await apres.inject({
        method: 'POST',
        url: `/api/seances/${seanceId}/appel/ouverture`,
        headers: { cookie: intervenant, origin: WEB_ORIGIN },
      });
      const cle = nouvelle.json<OuvertureAppel>().cle;
      expect(cle).not.toBe(avant.cle);
      const scanV2 = await scanner({
        jeton: await jetonDe({ ...avant, cle }),
      });
      expect(scanV2.json<ResultatScan>().statut).toMatch(/present|deja-emarge/);
      // Un QR signé d'une clé inconnue reste refusé.
      const inconnu = await genererJeton(new Uint8Array(32).fill(9), seanceId, Date.now());
      expect((await scanner({ jeton: inconnu.jeton })).statusCode).toBe(400);
    } finally {
      await apres.close();
    }
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
    expect(aAnimer.map((s) => s.id).sort()).toEqual(
      [seanceId, autreSeanceId, seanceDegradeeId].sort(),
    );
    expect(aAnimer[0]?.intervenant).toBe('ines Fictif');
    expect((await appeler('GET', '/api/seances', autreIntervenant)).json<SeanceProche[]>()).toEqual(
      [],
    );
    const aEmarger = (await appeler('GET', '/api/moi/seances', lea)).json<SeanceProche[]>();
    expect(aEmarger.map((s) => s.id).sort()).toEqual([seanceId, seanceDegradeeId].sort());
    expect((await appeler('GET', '/api/moi/seances', horsListe)).json<SeanceProche[]>()).toEqual(
      [],
    );
    expect((await appeler('GET', '/api/seances', lea)).statusCode).toBe(403);
  });

  it('RG-04-01 chacun des intervenants d’une séance l’anime et en ouvre l’appel', async () => {
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId: autreSeanceId, personneId: igorId });
    const aAnimer = (await appeler('GET', '/api/seances', autreIntervenant)).json<SeanceProche[]>();
    expect(aAnimer.map((s) => s.id)).toEqual([autreSeanceId]);
    expect(aAnimer[0]?.intervenant).toBe('igor Fictif, ines Fictif');
    expect((await ouvrir(autreSeanceId, autreIntervenant)).statut).toBe(200);
    expect((await ouvrir(autreSeanceId, intervenant)).statut).toBe(200);
    expect((await ouvrir(seanceId, autreIntervenant)).statut).toBe(403);
  });
});

describe('Mode dégradé (architecture, section 5)', () => {
  it('sans Valkey, ouvre l’appel et enregistre la présence directement en base, une seule fois', async () => {
    const valkey = app.get<Redis>(VALKEY);
    valkey.disconnect();
    try {
      const { statut, ouverture } = await ouvrir(seanceDegradeeId);
      expect(statut).toBe(200);
      const jeton = await jetonDe(ouverture);
      const premier = await appeler('POST', '/api/emargement/scan', lea, { jeton });
      expect(premier.json<ResultatScan>()).toMatchObject({ statut: 'present' });
      const second = await appeler('POST', '/api/emargement/scan', lea, { jeton });
      expect(second.json<ResultatScan>()).toMatchObject({ statut: 'deja-emarge' });
      const lignes = await owner.db
        .select()
        .from(presence)
        .where(eq(presence.seanceId, seanceDegradeeId));
      expect(lignes).toHaveLength(1);
      const direct = (
        await appeler('GET', `/api/seances/${seanceDegradeeId}/appel`, intervenant)
      ).json<AppelEnDirect>();
      expect(direct.presents).toBe(1);
    } finally {
      await valkey.connect();
    }
  });
});
