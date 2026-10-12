import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
  genererJeton,
  ROLES_PAR_DEFAUT,
  type AppelEnDirect,
  type OuvertureAppel,
  type PhotosAppel,
} from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
  inscrireManquants,
  newId,
  organisation,
  personne,
  presence,
  presenceMarquage,
  promotionTechnique,
  role,
  salle,
  seance,
  seanceIntervenant,
  seancePublic,
} from '@scolaly/db';
import { and, desc, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { masquerJetonsUrl } from '../src/app.js';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import type { ObjectStorage } from '../src/shared/storage/object-storage.js';
import { AUTH, OBJECT_STORAGE, VALKEY } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de l’appel manuel';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const CAMPUS = { latitude: 45.75, longitude: 4.85 };
const seances = { enCours: newId(), plusTard: newId(), autre: newId() };
const fiches: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function compte(nom: string, code: string) {
  const email = `${nom}.manuel@exemple.test`;
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
      prenom: nom,
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
  fiches[nom] = fiche?.id ?? '';
  cookies[nom] = await signInCookie(app, email, PASSWORD, { doubleAuthentification: false });
}

const appeler = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const marquer = (seanceId: string, personneId: string, corps: unknown, cookie = cookies.iris) =>
  appeler('PUT', `/api/seances/${seanceId}/appel/presences/${personneId}`, cookie ?? '', corps);

const ligne = (appel: AppelEnDirect, nom: string) =>
  appel.liste.find((l) => l.personneId === fiches[nom]);

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de l’appel manuel', nomAffichage: 'EAM' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({
      organisationId: ecole,
      nom: 'Campus fictif',
      localisationLatitude: CAMPUS.latitude,
      localisationLongitude: CAMPUS.longitude,
      localisationRayon: 300,
    })
    .returning();
  const [laSalle] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Salle 1' })
    .returning();
  await compte('iris', 'intervenant');
  await compte('hugo', 'intervenant');
  for (const nom of ['lou', 'max', 'zoe']) await compte(nom, 'apprenant');
  const promo = await promotionTechnique(owner.db, ecole, 'Promotion appel manuel');
  await inscrireManquants(owner.db, ecole, promo, [
    fiches.lou ?? '',
    fiches.max ?? '',
    fiches.zoe ?? '',
  ]);
  const debuts = {
    enCours: Date.now() - 60_000,
    plusTard: Date.now() + 3 * 3600_000,
    autre: Date.now() - 60_000,
  };
  for (const [cle, id] of Object.entries(seances) as [keyof typeof seances, string][]) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: `Séance ${cle}`,
      debut: new Date(debuts[cle]),
      fin: new Date(debuts[cle] + 2 * 3600_000),
      salleId: laSalle?.id ?? null,
    });
    await owner.db.insert(seanceIntervenant).values({
      organisationId: ecole,
      seanceId: id,
      personneId: (cle === 'autre' ? fiches.hugo : fiches.iris) ?? '',
    });
    await owner.db
      .insert(seancePublic)
      .values({ organisationId: ecole, seanceId: id, promotionId: promo });
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-06-04, US-06-05 appel manuel par l’intervenant', () => {
  it('US-06-05 marque présent un apprenant sans téléphone, trace la décision et la pousse en direct', async () => {
    const reponse = await marquer(seances.enCours, fiches.lou ?? '', {
      statut: 'present',
      minutesRetard: null,
    });
    expect(reponse.statusCode).toBe(200);
    const appel = reponse.json<AppelEnDirect>();
    expect(ligne(appel, 'lou')).toMatchObject({ statut: 'present', scanneLe: null });
    expect(ligne(appel, 'lou')?.marquage?.statut).toBe('present');
    expect(ligne(appel, 'max')?.statut).toBe('en-attente');
    expect(appel.presents).toBe(1);

    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.action, 'presence.marquer'))
      .orderBy(desc(auditEvenement.id))
      .limit(1);
    expect(trace?.avant).toMatchObject({ personneId: fiches.lou, statut: 'en-attente' });
    expect(trace?.apres).toMatchObject({ personneId: fiches.lou, statut: 'present' });

    // Liste en direct : la décision est copiée dans le cache après validation.
    const valkey = app.get<Redis>(VALKEY);
    expect(
      await valkey.hget(CLES_EMARGEMENT.marquages(seances.enCours), fiches.lou ?? ''),
    ).toContain('"present"');
    const direct = await appeler(
      'GET',
      `/api/seances/${seances.enCours}/appel`,
      cookies.iris ?? '',
    );
    expect(ligne(direct.json<AppelEnDirect>(), 'lou')?.statut).toBe('present');
  });

  it('RG-06-11 l’intervenant tranche un scan à vérifier : le scan reste, la décision l’emporte', async () => {
    const ouverture = await appeler(
      'POST',
      `/api/seances/${seances.enCours}/appel/ouverture`,
      cookies.iris ?? '',
    );
    const { cle } = ouverture.json<OuvertureAppel>();
    const { jeton } = await genererJeton(
      Buffer.from(cle, 'base64url'),
      seances.enCours,
      Date.now(),
    );
    const scan = await appeler('POST', '/api/emargement/scan', cookies.max ?? '', {
      jeton,
      position: { latitude: 45.77, longitude: 4.85, precisionMetres: 15 },
    });
    expect(scan.statusCode).toBe(200);
    let appel = (
      await appeler('GET', `/api/seances/${seances.enCours}/appel`, cookies.iris ?? '')
    ).json<AppelEnDirect>();
    // Sans décision, un scan à vérifier compte comme présent.
    expect(ligne(appel, 'max')).toMatchObject({ statut: 'a-verifier', localisation: 'hors-site' });
    expect(appel.presents).toBe(2);

    const retrait = await marquer(seances.enCours, fiches.max ?? '', {
      statut: 'absent',
      minutesRetard: null,
    });
    expect(retrait.statusCode).toBe(200);
    appel = retrait.json<AppelEnDirect>();
    expect(ligne(appel, 'max')).toMatchObject({ statut: 'absent', localisation: 'hors-site' });
    expect(ligne(appel, 'max')?.scanneLe).not.toBeNull();
    expect(appel.presents).toBe(1);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.action, 'presence.marquer'))
      .orderBy(desc(auditEvenement.id))
      .limit(1);
    expect(trace?.avant).toMatchObject({ statut: 'a-verifier' });
    expect(trace?.apres).toMatchObject({ statut: 'absent' });
    // Le scan n'est jamais effacé par la décision.
    expect(
      await app
        .get<Redis>(VALKEY)
        .hexists(CLES_EMARGEMENT.presences(seances.enCours), fiches.max ?? ''),
    ).toBe(1);
  });

  it('RG-06-12 note un retard en minutes, puis le corrige : une seule décision par apprenant', async () => {
    expect(
      (await marquer(seances.enCours, fiches.zoe ?? '', { statut: 'retard', minutesRetard: 12 }))
        .statusCode,
    ).toBe(200);
    const correction = await marquer(seances.enCours, fiches.zoe ?? '', {
      statut: 'retard',
      minutesRetard: 20,
    });
    expect(ligne(correction.json<AppelEnDirect>(), 'zoe')).toMatchObject({
      statut: 'retard',
      marquage: { statut: 'retard', minutesRetard: 20 },
    });
    const lignes = await owner.db
      .select()
      .from(presenceMarquage)
      .where(eq(presenceMarquage.personneId, fiches.zoe ?? ''));
    expect(lignes).toHaveLength(1);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.action, 'presence.marquer'))
      .orderBy(desc(auditEvenement.id))
      .limit(1);
    expect(trace?.avant).toMatchObject({ statut: 'retard', minutesRetard: 12 });
    expect(trace?.apres).toMatchObject({ statut: 'retard', minutesRetard: 20 });
  });

  it('RG-06-12 refuse un retard sans minutes, des minutes hors retard et un marquage avant l’ouverture', async () => {
    for (const corps of [
      { statut: 'retard', minutesRetard: null },
      { statut: 'absent', minutesRetard: 5 },
      { statut: 'retard', minutesRetard: 500 },
    ]) {
      expect((await marquer(seances.enCours, fiches.lou ?? '', corps)).statusCode).toBe(400);
    }
    const tot = await marquer(seances.plusTard, fiches.lou ?? '', {
      statut: 'present',
      minutesRetard: null,
    });
    expect(tot.statusCode).toBe(400);
    expect(tot.json<{ details: string[] }>().details[0]).toContain('pas encore ouvert');
  });

  it('refuse un apprenant non attendu, l’intervenant d’une autre séance et un apprenant', async () => {
    expect(
      (
        await marquer(seances.enCours, fiches.hugo ?? '', {
          statut: 'present',
          minutesRetard: null,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await marquer(
          seances.enCours,
          fiches.lou ?? '',
          { statut: 'absent', minutesRetard: null },
          cookies.hugo,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await marquer(
          seances.enCours,
          fiches.zoe ?? '',
          { statut: 'present', minutesRetard: null },
          cookies.lou,
        )
      ).statusCode,
    ).toBe(403);
    // Aucune présence n'est créée par une décision : le scan reste la seule preuve d'émargement.
    const scans = await owner.db
      .select()
      .from(presence)
      .where(eq(presence.seanceId, seances.autre));
    expect(scans).toHaveLength(0);
  });
});

describe('RG-01-27 photos de la liste d’appel par adresse signée', () => {
  it('donne une adresse signée, valable pour le seul compte qui l’a demandée', async () => {
    const storage = app.get<ObjectStorage>(OBJECT_STORAGE);
    const cle = `organisations/${ecole}/photos/${newId()}`;
    const image = Buffer.from('jpeg fictif');
    await storage.put(cle, image, 'image/jpeg', 'empreinte');
    await owner.db
      .update(personne)
      .set({ photoCle: cle, photoStatut: 'validee' })
      .where(eq(personne.id, fiches.lou ?? ''));

    const reponse = await appeler(
      'GET',
      `/api/seances/${seances.enCours}/appel/photos`,
      cookies.iris ?? '',
    );
    expect(reponse.statusCode).toBe(200);
    const { photos, expireLe } = reponse.json<PhotosAppel>();
    expect(Date.parse(expireLe) - Date.now()).toBeLessThanOrEqual(300_000);
    // Seuls les attendus qui ont une photo validée en ont une.
    expect(photos.map((p) => p.personneId)).toEqual([fiches.lou]);
    const url = photos[0]?.url ?? '';
    expect(url).toMatch(/^\/api\/photos\/appel\?jeton=/);
    // Le jeton n'apparaît pas dans les journaux.
    expect(masquerJetonsUrl(url)).toBe('/api/photos/appel?jeton=[masqué]');
    expect(url).not.toContain(cle);

    const lue = await appeler('GET', url, cookies.iris ?? '');
    expect(lue.statusCode).toBe(200);
    expect(lue.headers['content-type']).toBe('image/jpeg');
    expect(lue.headers['cache-control']).toBe('private, max-age=300');
    expect(lue.rawPayload.equals(image)).toBe(true);

    // Un autre compte, une signature altérée ou sans session : rien.
    expect((await appeler('GET', url, cookies.hugo ?? '')).statusCode).toBe(404);
    expect((await appeler('GET', `${url.slice(0, -2)}xx`, cookies.iris ?? '')).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    // Les photos de la liste ne sont données qu'aux intervenants de la séance.
    expect(
      (await appeler('GET', `/api/seances/${seances.enCours}/appel/photos`, cookies.hugo ?? ''))
        .statusCode,
    ).toBe(403);
    expect(
      (await appeler('GET', `/api/seances/${seances.enCours}/appel/photos`, cookies.lou ?? ''))
        .statusCode,
    ).toBe(403);
  });
});
