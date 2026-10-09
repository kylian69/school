import { randomBytes } from 'node:crypto';
import {
  contexteChiffrement,
  createDatabase,
  FieldEncryption,
  fluxIcal,
  newId,
  organisation,
  personne,
  type FieldEncryptionKeys,
} from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { loadWorkerEnv } from '../src/config/env.js';
import { commandeRotation } from '../src/rotation-cle.js';

const app = createDatabase(inject('appUrl'), { max: 2 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const v1 = randomBytes(32);
const v2 = randomBytes(32);
const organisationId = newId();
const personneId = newId();
const fluxId = newId();
const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  VALKEY_URL: 'redis://localhost:6379',
  SMTP_URL: 'smtp://localhost:1025',
  MAIL_FROM: 'Scolaly <ne-pas-repondre@exemple.test>',
  PUBLIC_URL: 'http://localhost:3000',
};

const cles = (currentVersion: number, versions = [1, 2]): FieldEncryptionKeys => ({
  masterKeys: new Map(versions.map((v) => [v, v === 1 ? v1 : v2])),
  currentVersion,
});

async function commande(keys: FieldEncryptionKeys, ...argv: string[]) {
  const lignes: string[] = [];
  const code = await commandeRotation(argv, {
    db: app.db,
    keys,
    chiffrement: new FieldEncryption(keys),
    ecrire: (ligne) => lignes.push(ligne),
  });
  return { code, sortie: lignes.join('\n') };
}

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: organisationId, nom: 'École fictive de rotation', nomAffichage: 'EFR' });
  await owner.db.insert(personne).values({
    id: personneId,
    organisationId,
    nom: 'Roux',
    prenom: 'Alix',
    email: `alix.${personneId}@exemple.test`,
  });
  await owner.db.insert(fluxIcal).values({
    id: fluxId,
    organisationId,
    personneId,
    jetonEmpreinte: randomBytes(16).toString('hex'),
    jetonChiffre: new FieldEncryption(cles(1, [1])).encrypt(
      'jeton-fictif',
      organisationId,
      contexteChiffrement('flux_ical.jeton', personneId),
    ),
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('Rotation de la clé maîtresse : configuration du worker (ADR 0006)', () => {
  it('lit toutes les versions de clé et la version courante', () => {
    const env = loadWorkerEnv({
      ...base,
      ENCRYPTION_MASTER_KEY_V1: v1.toString('base64'),
      ENCRYPTION_MASTER_KEY_V2: v2.toString('base64'),
      ENCRYPTION_KEY_VERSION: '2',
    });
    expect(env.chiffrement.currentVersion).toBe(2);
    expect([...env.chiffrement.masterKeys.keys()].sort()).toEqual([1, 2]);
  });

  it('refuse de démarrer sans clé pour la version courante, sans afficher les clés', () => {
    const secret = v1.toString('base64');
    const demarrer = () =>
      loadWorkerEnv({ ...base, ENCRYPTION_MASTER_KEY_V1: secret, ENCRYPTION_KEY_VERSION: '2' });
    expect(demarrer).toThrow(/ENCRYPTION_KEY_VERSION : aucune clé ENCRYPTION_MASTER_KEY_V2/);
    try {
      demarrer();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
    expect(() => loadWorkerEnv(base)).toThrow(/ENCRYPTION_MASTER_KEY_V1 : obligatoire/);
  });
});

describe('Rotation de la clé maîtresse : commande de contrôle (ADR 0006)', () => {
  it('ajouter, basculer, rechiffrer, puis retirer l’ancienne clé', async () => {
    const etat = await commande(cles(1), 'etat');
    expect(etat.code).toBe(0);
    expect(etat.sortie).toContain('Version courante : v1');
    expect(etat.sortie).toMatch(/flux_ical\.jeton v1 : \d+/);
    expect(etat.sortie).not.toContain('jeton-fictif');

    expect((await commande(cles(1), 'retrait-possible', '1')).code).toBe(1);
    // Bascule sur v2 : v1 reste utilisée tant que le rechiffrement n'est pas passé.
    const avant = await commande(cles(2), 'retrait-possible', '1');
    expect(avant.code).toBe(1);
    expect(avant.sortie).toMatch(/valeur\(s\) à rechiffrer/);

    await commande(cles(2), 'rechiffrer');
    const [ligne] = await owner.db
      .select({ jeton: fluxIcal.jetonChiffre })
      .from(fluxIcal)
      .where(eq(fluxIcal.id, fluxId));
    expect(ligne?.jeton).toMatch(/^v2\./);
    expect(
      new FieldEncryption(cles(2, [2])).decrypt(
        ligne?.jeton ?? '',
        organisationId,
        contexteChiffrement('flux_ical.jeton', personneId),
      ),
    ).toBe('jeton-fictif');
    expect((await commande(cles(2), 'retrait-possible', '2')).code).toBe(1);
    expect((await commande(cles(2), 'inconnue')).code).toBe(2);
  });
});
