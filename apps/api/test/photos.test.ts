import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type BilanImportPhotos,
  type PersonneDetail,
  type PhotoPersonne,
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
import { and, eq } from 'drizzle-orm';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { emailsEnFile, signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des photos';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let admin: string;
let direction: string;
let eleve: string;
let eleveId: string;

async function compte(email: string, code: string, perimetre: 'organisation' | 'soi') {
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
    debut: '2026-01-01',
  });
  return fiche?.id ?? '';
}

/** Image de test unie, avec des métadonnées EXIF à faire disparaître. */
const image = (largeur: number, hauteur: number, format: 'png' | 'jpeg') => {
  const base = sharp({
    create: { width: largeur, height: hauteur, channels: 3, background: { r: 79, g: 70, b: 229 } },
  }).withExif({ IFD0: { Copyright: 'Appareil fictif' } });
  return (format === 'png' ? base.png() : base.jpeg()).toBuffer();
};

const envoyer = (url: string, contenu: Buffer, type: string, cookie: string) =>
  app.inject({
    method: 'PUT',
    url,
    headers: { cookie, origin: WEB_ORIGIN, 'content-type': type },
    payload: contenu,
  });
const requete = (method: 'GET' | 'POST', url: string, cookie = admin, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });
const fiche = async (id: string, cookie = admin) =>
  (await requete('GET', `/api/personnes/${id}`, cookie)).json<PersonneDetail>();

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des photos', nomAffichage: 'EDP' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  await compte('admin.photos@exemple.test', 'administrateur', 'organisation');
  await compte('direction.photos@exemple.test', 'direction', 'organisation');
  eleveId = await compte('eleve.photos@exemple.test', 'apprenant', 'soi');
  admin = await signInCookie(app, 'admin.photos@exemple.test', PASSWORD);
  direction = await signInCookie(app, 'direction.photos@exemple.test', PASSWORD);
  eleve = await signInCookie(app, 'eleve.photos@exemple.test', PASSWORD, {
    doubleAuthentification: false,
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-01-20 photos des apprenants', () => {
  it('RG-01-26 recadre en carré de 512 px, réencode en JPEG et retire les métadonnées', async () => {
    const reponse = await envoyer(
      `/api/personnes/${eleveId}/photo`,
      await image(600, 800, 'png'),
      'image/png',
      admin,
    );
    expect(reponse.statusCode).toBe(200);
    const { photo } = reponse.json<PersonneDetail>();
    expect(photo).toMatchObject({ statut: 'validee', attenteUrl: null });
    const servie = await requete('GET', photo?.url ?? '');
    expect(servie.headers['content-type']).toBe('image/jpeg');
    expect(servie.headers['cache-control']).toContain('private');
    const meta = await sharp(servie.rawPayload).metadata();
    expect(meta).toMatchObject({ width: 512, height: 512, format: 'jpeg' });
    expect(meta.exif).toBeUndefined();
  });

  it('refuse une photo trop lourde, d’un autre format ou illisible', async () => {
    const lourde = Buffer.concat([await image(10, 10, 'png'), Buffer.alloc(5 * 1024 * 1024)]);
    const cas = [
      [lourde, 'image/png', /5 Mo/],
      [Buffer.from('%PDF-1.7 fictif'), 'image/jpeg', /JPEG et PNG/],
      [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), 'image/jpeg', /illisible/],
    ] as const;
    for (const [contenu, type, message] of cas) {
      const refus = await envoyer(`/api/personnes/${eleveId}/photo`, contenu, type, admin);
      expect(refus.statusCode).toBe(400);
      expect(refus.json<{ details: string[] }>().details[0]).toMatch(message);
    }
  });

  it('RG-01-26 la photo déposée par l’apprenant attend la validation, et un refus est expliqué', async () => {
    const depot = await envoyer(
      '/api/moi/photo',
      await image(800, 600, 'jpeg'),
      'image/jpeg',
      eleve,
    );
    expect(depot.statusCode).toBe(200);
    const maPhoto = depot.json<PhotoPersonne>();
    expect(maPhoto).toMatchObject({ statut: 'en_attente' });
    expect(maPhoto.attenteUrl).toMatch(/^\/api\/moi\/photo\/image\?attente=1/);
    expect((await requete('GET', maPhoto.attenteUrl ?? '', eleve)).statusCode).toBe(200);

    const vue = await fiche(eleveId);
    expect(vue.photo?.attenteUrl).toMatch(/attente=1/);
    expect((await requete('GET', vue.photo?.attenteUrl ?? '')).statusCode).toBe(200);

    const sansMotif = await requete('POST', `/api/personnes/${eleveId}/photo/decision`, admin, {
      decision: 'refuser',
    });
    expect(sansMotif.statusCode).toBe(400);
    const refus = await requete('POST', `/api/personnes/${eleveId}/photo/decision`, admin, {
      decision: 'refuser',
      motif: 'Visage caché par des lunettes de soleil.',
    });
    expect(refus.json<PersonneDetail>().photo).toMatchObject({
      statut: 'refusee',
      motif: 'Visage caché par des lunettes de soleil.',
      attenteUrl: null,
    });
    const email = (await emailsEnFile()).find((e) => e.to === 'eleve.photos@exemple.test');
    expect(email?.text).toMatch(/lunettes de soleil/);
  });

  it('valide une nouvelle photo déposée, qui remplace l’ancienne', async () => {
    const avant = (await fiche(eleveId)).photo?.url;
    await envoyer('/api/moi/photo', await image(700, 700, 'jpeg'), 'image/jpeg', eleve);
    const valide = await requete('POST', `/api/personnes/${eleveId}/photo/decision`, admin, {
      decision: 'valider',
    });
    const { photo } = valide.json<PersonneDetail>();
    expect(photo?.statut).toBe('validee');
    expect(photo?.url).not.toBe(avant);
    expect(
      (
        await requete('POST', `/api/personnes/${eleveId}/photo/decision`, admin, {
          decision: 'valider',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('RG-01-27 la direction voit la photo validée, pas celle en attente ; un apprenant ne voit pas les autres', async () => {
    const { photo } = await fiche(eleveId, direction);
    expect(photo?.attenteUrl).toBeNull();
    expect((await requete('GET', photo?.url ?? '', direction)).statusCode).toBe(200);
    expect(
      (await requete('GET', `/api/personnes/${eleveId}/photo?attente=1`, direction)).statusCode,
    ).toBe(403);
    expect((await requete('GET', `/api/personnes/${eleveId}/photo`, eleve)).statusCode).toBe(403);
  });
});

describe('US-01-20 import des photos par archive ZIP', () => {
  it('associe chaque photo à la fiche de son matricule et signale les fichiers sans correspondance', async () => {
    const matricules = ['ZIP-0001', 'ZIP-0002', 'ZIP-0003'];
    const ids: string[] = [];
    for (const matricule of matricules) {
      const [ligne] = await owner.db
        .insert(personne)
        .values({
          organisationId: ecole,
          nom: 'Archive',
          prenom: 'Lou',
          email: `${matricule.toLowerCase()}@exemple.test`,
          matricule,
        })
        .returning();
      ids.push(ligne?.id ?? '');
    }
    const archive = zipSync({
      'promo/ZIP-0001.jpg': new Uint8Array(await image(640, 480, 'jpeg')),
      'promo/ZIP-0002.PNG': new Uint8Array(await image(300, 300, 'png')),
      'ZIP-0003.jpg': new Uint8Array(Buffer.from('pas une image')),
      'INCONNU-42.jpg': new Uint8Array(await image(100, 100, 'jpeg')),
      'promo/lisez-moi.txt': new Uint8Array(Buffer.from('ignoré')),
      '__MACOSX/promo/._ZIP-0001.jpg': new Uint8Array([0, 1, 2]),
    });
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/photos/import',
      headers: { cookie: admin, origin: WEB_ORIGIN, 'content-type': 'application/zip' },
      payload: Buffer.from(archive),
    });
    expect(reponse.statusCode).toBe(200);
    const bilan = reponse.json<BilanImportPhotos>();
    expect(bilan.associees).toBe(2);
    expect(bilan.sansCorrespondance).toEqual(['INCONNU-42.jpg']);
    expect(bilan.rejetes).toEqual([
      { fichier: 'ZIP-0003.jpg', motif: expect.stringMatching(/JPEG et PNG/) as string },
    ]);
    for (const id of ids.slice(0, 2)) {
      const { photo } = await fiche(id);
      expect(photo?.statut).toBe('validee');
      const servie = await requete('GET', photo?.url ?? '');
      expect(await sharp(servie.rawPayload).metadata()).toMatchObject({ width: 512, height: 512 });
    }
    expect((await fiche(ids[2] ?? '')).photo?.url).toBeNull();
  });

  it('refuse une archive illisible, et l’import aux personnes sans le droit', async () => {
    const illisible = await app.inject({
      method: 'POST',
      url: '/api/photos/import',
      headers: { cookie: admin, origin: WEB_ORIGIN, 'content-type': 'application/zip' },
      payload: Buffer.from('ceci n’est pas une archive'),
    });
    expect(illisible.statusCode).toBe(400);
    expect(illisible.json<{ details: string[] }>().details[0]).toMatch(/illisible/);
    const interdit = await app.inject({
      method: 'POST',
      url: '/api/photos/import',
      headers: { cookie: eleve, origin: WEB_ORIGIN, 'content-type': 'application/zip' },
      payload: Buffer.from(zipSync({})),
    });
    expect(interdit.statusCode).toBe(403);
  });
});
