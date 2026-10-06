import {
  CLES_EMARGEMENT,
  lireSeanceEnCache,
  PREFIXE_SESSIONS,
  type PresenceEnCache,
} from '@scolaly/contracts';
import {
  authSession,
  authUser,
  createDatabase,
  newId,
  organisation,
  personne,
  presence,
  seance,
  seanceAttendu,
} from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { prechargerSeances, startPersistancePresences } from '../src/emargement.js';
import { createLogger } from '../src/logger.js';

// Base Valkey à part : le flux de l'émargement est une clé unique, partagée par tous ses lecteurs.
const valkey = new Redis(inject('valkeyUrl').replace(/\/\d+$/, '/14'));
const app = createDatabase(inject('appUrl'), { max: 4 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const logger = createLogger('silent');
const ecole = newId();
const seanceId = newId();
const fiches: string[] = [];
const jetonLou = `jeton-lou-${newId()}`;

beforeAll(async () => {
  await valkey.flushdb();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École du worker', nomAffichage: 'EW' });
  for (const prenom of ['Lou', 'Sam', 'Max']) {
    const id = newId();
    fiches.push(id);
    const userId = prenom === 'Max' ? null : newId();
    if (userId) {
      await owner.db.insert(authUser).values({
        id: userId,
        name: prenom,
        email: `${prenom.toLowerCase()}.${userId}@exemple.test`,
      });
      if (prenom === 'Lou') {
        await owner.db.insert(authSession).values({
          userId,
          token: jetonLou,
          expiresAt: new Date(Date.now() + 86_400_000),
        });
      }
    }
    await owner.db.insert(personne).values({
      id,
      organisationId: ecole,
      nom: 'Fictif',
      prenom,
      email: `${prenom.toLowerCase()}.${id}@exemple.test`,
      userId,
    });
  }
  const debut = new Date(Date.now() + 5 * 60_000);
  await owner.db.insert(seance).values({
    id: seanceId,
    organisationId: ecole,
    libelle: 'Droit du travail',
    debut,
    fin: new Date(debut.getTime() + 3600_000),
  });
  for (const personneId of fiches) {
    await owner.db.insert(seanceAttendu).values({ organisationId: ecole, seanceId, personneId });
  }
});

afterAll(async () => {
  await valkey.flushdb();
  valkey.disconnect();
  await app.close();
  await owner.close();
});

const scan = (personneId: string, sId = seanceId): PresenceEnCache => ({
  organisationId: ecole,
  seanceId: sId,
  personneId,
  scanneLe: new Date().toISOString(),
  mode: 'qr',
  rejoue: false,
});

const attendre = async (condition: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Condition jamais remplie');
};

describe('RG-00-17 préchargement des séances', () => {
  it('charge la séance et ses attendus ayant un compte, toutes écoles confondues', async () => {
    expect(await prechargerSeances(app.db, valkey)).toBeGreaterThanOrEqual(1);
    const enCache = lireSeanceEnCache(await valkey.hgetall(CLES_EMARGEMENT.seance(seanceId)));
    expect(enCache).toMatchObject({ organisationId: ecole, libelle: 'Droit du travail' });
    const attendus = await valkey.hvals(CLES_EMARGEMENT.attendus(seanceId));
    expect(attendus.sort()).toEqual(fiches.slice(0, 2).sort());
    expect(await valkey.ttl(CLES_EMARGEMENT.seance(seanceId))).toBeGreaterThan(3600);
    // Session de Lou remise en cache, au format de Better Auth.
    const enCacheLou = await valkey.get(PREFIXE_SESSIONS + jetonLou);
    expect(JSON.parse(enCacheLou ?? '{}')).toMatchObject({ session: { token: jetonLou } });
  });
});

describe('RG-00-18 écriture des présences par lots', () => {
  it('écrit le flux en base sans doublon, écarte une entrée invalide et vide le flux', async () => {
    const [lou = '', sam = ''] = fiches;
    for (const p of [scan(lou), scan(sam), scan(lou), scan(sam, newId())]) {
      await valkey.xadd(CLES_EMARGEMENT.flux, '*', 'presence', JSON.stringify(p));
    }
    const persistance = startPersistancePresences({ valkey, db: app.db, logger, attenteMs: 100 });
    try {
      await attendre(async () => (await valkey.xlen(CLES_EMARGEMENT.flux)) === 0);
    } finally {
      await persistance.stop();
    }
    const lignes = await owner.db.select().from(presence).where(eq(presence.organisationId, ecole));
    expect(lignes.map((l) => l.personneId).sort()).toEqual([lou, sam].sort());
    const enAttente = (await valkey.xpending(CLES_EMARGEMENT.flux, CLES_EMARGEMENT.groupeFlux)) as [
      number,
    ];
    expect(enAttente[0]).toBe(0);
  });
});
