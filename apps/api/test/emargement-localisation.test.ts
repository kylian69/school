import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
  genererJeton,
  ROLES_PAR_DEFAUT,
  type AppelEnDirect,
  type OuvertureAppel,
  type PresenceEnCache,
  type ResultatScan,
  type SeanceProche,
} from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  effacerLocalisationsEchues,
  enregistrerPresences,
  etablissement,
  initialiserRolesParDefaut,
  inscrireManquants,
  newId,
  organisation,
  personne,
  presence,
  promotionTechnique,
  role,
  salle,
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

const PASSWORD = 'phrase de passe des tests de la localisation';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
/** Campus fictif : 0,001° de latitude ≈ 111 m. */
const CAMPUS = { latitude: 45.75, longitude: 4.85 };
const surPlace = { latitude: 45.7505, longitude: 4.85, precisionMetres: 15 };
const loin = { latitude: 45.77, longitude: 4.85, precisionMetres: 15 };
const seances = {
  salle: newId(),
  distanciel: newId(),
  desactive: newId(),
  code: newId(),
  campusIp: newId(),
};
const apprenants: Record<string, string> = {};
let intervenant: string;

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

const appeler = (
  method: 'GET' | 'POST',
  url: string,
  cookie: string,
  payload?: unknown,
  remoteAddress?: string,
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
    ...(remoteAddress ? { remoteAddress } : {}),
  });

async function jetonOuvert(id: string) {
  const reponse = await appeler('POST', `/api/seances/${id}/appel/ouverture`, intervenant);
  expect(reponse.statusCode).toBe(200);
  const ouverture = reponse.json<OuvertureAppel>();
  return (await genererJeton(Buffer.from(ouverture.cle, 'base64url'), id, Date.now())).jeton;
}

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de la localisation', nomAffichage: 'EDL' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  // Deux établissements : l'un contrôle (coordonnées et réseau), l'autre a désactivé le contrôle.
  const [campus] = await owner.db
    .insert(etablissement)
    .values({
      organisationId: ecole,
      nom: 'Campus fictif',
      localisationLatitude: CAMPUS.latitude,
      localisationLongitude: CAMPUS.longitude,
      localisationRayon: 300,
      localisationPlagesIp: ['192.0.2.0/24', '2001:db8::/32'],
    })
    .returning();
  const [annexe] = await owner.db
    .insert(etablissement)
    .values({
      organisationId: ecole,
      nom: 'Annexe fictive',
      localisationActive: false,
      localisationLatitude: CAMPUS.latitude,
      localisationLongitude: CAMPUS.longitude,
    })
    .returning();
  const [salleCampus] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Salle 1' })
    .returning();
  const [salleAnnexe] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: annexe?.id ?? '', nom: 'Salle A' })
    .returning();
  const intervenantId = await compte('iris.intervenante@exemple.test', 'intervenant');
  const ids: string[] = [];
  for (const nom of ['lou', 'max', 'zoe', 'eva', 'ali']) {
    ids.push(await compte(`${nom}.apprenant@exemple.test`, 'apprenant'));
  }
  const promo = await promotionTechnique(owner.db, ecole, 'Promotion localisation');
  await inscrireManquants(owner.db, ecole, promo, ids);
  const debut = new Date(Date.now() - 60_000);
  const salles: Record<keyof typeof seances, string | null> = {
    salle: salleCampus?.id ?? null,
    distanciel: salleCampus?.id ?? null,
    desactive: salleAnnexe?.id ?? null,
    code: salleCampus?.id ?? null,
    campusIp: salleCampus?.id ?? null,
  };
  for (const [cle, id] of Object.entries(seances) as [keyof typeof seances, string][]) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: `Séance ${cle}`,
      debut,
      fin: new Date(debut.getTime() + 2 * 3600_000),
      salleId: salles[cle],
      distanciel: cle === 'distanciel',
    });
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId: id, personneId: intervenantId });
    await owner.db
      .insert(seancePublic)
      .values({ organisationId: ecole, seanceId: id, promotionId: promo });
  }
  intervenant = await connexion('iris.intervenante@exemple.test');
  for (const nom of ['lou', 'max', 'zoe', 'eva', 'ali']) {
    apprenants[nom] = await connexion(`${nom}.apprenant@exemple.test`);
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

const scanner = async (cookie: string, corps: unknown, remoteAddress?: string) => {
  const reponse = await appeler('POST', '/api/emargement/scan', cookie, corps, remoteAddress);
  expect(reponse.statusCode).toBe(200);
  return reponse.json<ResultatScan>();
};

describe('RG-06-09, RG-06-10 contrôle de localisation au scan', () => {
  it('RGPD-03 compare la position au périmètre sans requête SQL et ne garde que le résultat', async () => {
    const jeton = await jetonOuvert(seances.salle);
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
    let resultats: ResultatScan[];
    try {
      resultats = [
        await scanner(apprenants.lou ?? '', { jeton, position: surPlace }),
        await scanner(apprenants.max ?? '', { jeton, position: loin }),
        // Refus de l'autorisation : pas de position, réseau inconnu ; le scan passe quand même.
        await scanner(apprenants.zoe ?? '', { jeton }),
        // Précision plus large que le rayon : position inexploitable.
        await scanner(apprenants.eva ?? '', {
          jeton,
          position: { ...surPlace, precisionMetres: 2000 },
        }),
      ];
    } finally {
      pool.query = query;
      pool.connect = connect;
    }
    expect(requetes).toBe(0);
    expect(resultats.map((r) => [r.statut, r.localisation])).toEqual([
      ['present', 'sur-place'],
      ['present', 'hors-site'],
      ['present', 'inconnu'],
      ['present', 'inconnu'],
    ]);
    // Un second scan renvoie le résultat du premier.
    expect(await scanner(apprenants.max ?? '', { jeton, position: surPlace })).toMatchObject({
      statut: 'deja-emarge',
      localisation: 'hors-site',
    });

    // Ni la position ni l'adresse IP ne sont mises en cache ou transmises au worker.
    const valkey = app.get<Redis>(VALKEY);
    const enCache = await valkey.hvals(CLES_EMARGEMENT.presences(seances.salle));
    const flux = (await valkey.xrange(CLES_EMARGEMENT.flux, '-', '+'))
      .map(([, champs]) => champs[1] ?? '')
      .filter((p) => p.includes(seances.salle));
    for (const texte of [...enCache, ...flux]) {
      expect(texte).not.toMatch(/latitude|longitude|45\.75|precision|192\.0\.2/);
    }
    expect(Object.keys(JSON.parse(flux[0] ?? '{}') as PresenceEnCache).sort()).toEqual([
      'localisation',
      'mode',
      'organisationId',
      'personneId',
      'rejoue',
      'scanneLe',
      'seanceId',
    ]);

    // RG-06-11 : l'intervenant voit le résultat de chaque scan.
    const direct = (
      await appeler('GET', `/api/seances/${seances.salle}/appel`, intervenant)
    ).json<AppelEnDirect>();
    const parPrenom = new Map(direct.liste.map((l) => [l.prenom, l.localisation]));
    expect(parPrenom.get('lou')).toBe('sur-place');
    expect(parPrenom.get('max')).toBe('hors-site');
    expect(parPrenom.get('ali')).toBeNull();
  });

  it('RGPD-03 sans position, le réseau du campus (IPv4, IPv6) établit la présence sur place', async () => {
    const jeton = await jetonOuvert(seances.campusIp);
    expect(await scanner(apprenants.lou ?? '', { jeton }, '192.0.2.44')).toMatchObject({
      localisation: 'sur-place',
    });
    expect(await scanner(apprenants.max ?? '', { jeton }, '2001:db8::7')).toMatchObject({
      localisation: 'sur-place',
    });
    expect(await scanner(apprenants.zoe ?? '', { jeton }, '198.51.100.9')).toMatchObject({
      localisation: 'inconnu',
    });
  });

  it('RG-06-05 le code à 6 chiffres accepte aussi la position', async () => {
    const reponse = await appeler(
      'POST',
      `/api/seances/${seances.code}/appel/ouverture`,
      intervenant,
    );
    const ouverture = reponse.json<OuvertureAppel>();
    const { code } = await genererJeton(
      Buffer.from(ouverture.cle, 'base64url'),
      seances.code,
      Date.now(),
    );
    const resultat = await appeler('POST', '/api/emargement/code', apprenants.lou ?? '', {
      seanceId: seances.code,
      code,
      position: loin,
    });
    expect(resultat.json<ResultatScan>()).toMatchObject({ localisation: 'hors-site' });
  });

  it('RG-06-08 séance à distance et contrôle désactivé : aucun contrôle, la position est ignorée', async () => {
    for (const id of [seances.distanciel, seances.desactive]) {
      const jeton = await jetonOuvert(id);
      expect(await scanner(apprenants.lou ?? '', { jeton, position: loin })).toMatchObject({
        statut: 'present',
        localisation: null,
      });
    }
  });

  it('RGPD-03 l’apprenant sait, avant de scanner, quelles séances contrôlent sa position', async () => {
    const liste = (await appeler('GET', '/api/moi/seances', apprenants.ali ?? '')).json<
      SeanceProche[]
    >();
    const controle = new Map(liste.map((s) => [s.id, s.localisation]));
    expect(controle.get(seances.salle)).toBe(true);
    expect(controle.get(seances.distanciel)).toBe(false);
    expect(controle.get(seances.desactive)).toBe(false);
  });

  it('écrit le résultat en base, puis l’efface à l’échéance de conservation', async () => {
    const db = app.get<Database>(DATABASE);
    const [fiche] = await owner.db
      .select({ id: personne.id })
      .from(personne)
      .where(
        and(eq(personne.organisationId, ecole), eq(personne.email, 'ali.apprenant@exemple.test')),
      );
    const scanneLe = new Date(Date.now() - 90 * 86_400_000).toISOString();
    await enregistrerPresences(db, [
      {
        organisationId: ecole,
        seanceId: seances.salle,
        personneId: fiche?.id ?? '',
        scanneLe,
        mode: 'qr',
        rejoue: false,
        localisation: 'hors-site',
      },
    ]);
    const lire = async () =>
      (
        await owner.db
          .select({ localisation: presence.localisation })
          .from(presence)
          .where(
            and(eq(presence.seanceId, seances.salle), eq(presence.personneId, fiche?.id ?? '')),
          )
      )[0]?.localisation;
    expect(await lire()).toBe('hors-site');
    expect(await effacerLocalisationsEchues(db, new Date(Date.now() - 60 * 86_400_000))).toBe(1);
    expect(await lire()).toBeNull();
    // La présence reste.
    expect(
      await owner.db
        .select()
        .from(presence)
        .where(eq(presence.personneId, fiche?.id ?? '')),
    ).toHaveLength(1);
  });
});
