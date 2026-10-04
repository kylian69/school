import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldEncryption, FieldEncryptionError, keysFromEnv } from './field-encryption.js';

const orgA = '01a10000-0000-7000-8000-00000000000a';
const orgB = '01a10000-0000-7000-8000-00000000000b';
const v1 = randomBytes(32);
const v2 = randomBytes(32);
const encryption = (currentVersion: number) =>
  new FieldEncryption({
    masterKeys: new Map([
      [1, v1],
      [2, v2],
    ]),
    currentVersion,
  });

describe('Chiffrement par champ (ADR 0002)', () => {
  it('chiffre et déchiffre une valeur, sans la laisser lisible', () => {
    const crypto = encryption(1);
    const payload = crypto.encrypt('2 99 99 99 999 999 99', orgA, 'personne.nir');
    expect(payload).toMatch(/^v1\./);
    expect(payload).not.toContain('99 99 99');
    expect(crypto.decrypt(payload, orgA, 'personne.nir')).toBe('2 99 99 99 999 999 99');
  });

  it('produit un chiffré différent à chaque fois (IV aléatoire)', () => {
    const crypto = encryption(1);
    expect(crypto.encrypt('x', orgA, 'c')).not.toBe(crypto.encrypt('x', orgA, 'c'));
  });

  it('ne déchiffre pas une valeur recopiée dans une autre organisation ou un autre champ', () => {
    const crypto = encryption(1);
    const payload = crypto.encrypt('FR00 0000 0000 0000 0000 0000 000', orgA, 'payeur.iban');
    expect(() => crypto.decrypt(payload, orgB, 'payeur.iban')).toThrow(FieldEncryptionError);
    expect(() => crypto.decrypt(payload, orgA, 'personne.nir')).toThrow(FieldEncryptionError);
  });

  it('détecte une valeur altérée ou mal formée', () => {
    const crypto = encryption(1);
    const [version, iv, data, tag] = crypto.encrypt('secret', orgA, 'c').split('.');
    const altered = [version, iv, `${data?.slice(0, -2)}AA`, tag].join('.');
    expect(() => crypto.decrypt(altered, orgA, 'c')).toThrow(/altérée/);
    expect(() => crypto.decrypt('pas-chiffre', orgA, 'c')).toThrow(/mal formée/);
    expect(() => crypto.decrypt('v9.a.b.c', orgA, 'c')).toThrow(/v9 absente/);
  });

  it('rotation : lit les anciennes versions et signale les valeurs à rechiffrer', () => {
    const ancienne = encryption(1).encrypt('valeur', orgA, 'c');
    const crypto = encryption(2);
    expect(crypto.decrypt(ancienne, orgA, 'c')).toBe('valeur');
    expect(crypto.needsReencryption(ancienne)).toBe(true);
    expect(crypto.needsReencryption(crypto.encrypt('valeur', orgA, 'c'))).toBe(false);
  });

  it('refuse une configuration de clés incomplète ou de mauvaise taille', () => {
    expect(
      () => new FieldEncryption({ masterKeys: new Map([[1, v1]]), currentVersion: 2 }),
    ).toThrow(/v2 absente/);
    expect(
      () => new FieldEncryption({ masterKeys: new Map([[1, randomBytes(16)]]), currentVersion: 1 }),
    ).toThrow(/32 octets/);
  });

  it("lit les clés versionnées depuis l'environnement", () => {
    const keys = keysFromEnv({
      ENCRYPTION_MASTER_KEY_V1: v1.toString('base64'),
      ENCRYPTION_MASTER_KEY_V2: v2.toString('base64'),
    });
    expect(keys.currentVersion).toBe(2);
    expect(keys.masterKeys.get(1)?.equals(v1)).toBe(true);
    expect(
      keysFromEnv({ ENCRYPTION_MASTER_KEY_V1: 'a', ENCRYPTION_KEY_VERSION: '1' }).currentVersion,
    ).toBe(1);
  });
});
