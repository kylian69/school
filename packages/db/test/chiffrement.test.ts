import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cleMaitresseCourante,
  clesMaitressesParPriorite,
  FieldEncryption,
  FieldEncryptionError,
  lireClesDeChiffrement,
} from '../src/chiffrement.js';

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
    const tronquee = [version, iv, data, tag?.slice(0, 8)].join('.');
    expect(() => crypto.decrypt(tronquee, orgA, 'c')).toThrow(/altérée/);
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

  it('rotation : rechiffre une ancienne valeur avec la version courante', () => {
    const ancienne = encryption(1).encrypt('valeur', orgA, 'c');
    const crypto = encryption(2);
    const nouvelle = crypto.reencrypt(ancienne, orgA, 'c');
    expect(nouvelle).toMatch(/^v2\./);
    expect(crypto.decrypt(nouvelle, orgA, 'c')).toBe('valeur');
    expect(crypto.currentVersion).toBe(2);
  });
});

describe('Lecture des clés au démarrage (ADR 0006)', () => {
  const b64 = (key: Buffer) => key.toString('base64');
  const erreurs = (env: Record<string, string | undefined>) => {
    const lecture = lireClesDeChiffrement(env);
    return lecture.ok ? [] : lecture.erreurs;
  };

  it('lit toutes les versions présentes et la version courante', () => {
    const lecture = lireClesDeChiffrement({
      ENCRYPTION_MASTER_KEY_V1: b64(v1),
      ENCRYPTION_MASTER_KEY_V2: b64(v2),
      ENCRYPTION_MASTER_KEY_V3: '',
      ENCRYPTION_KEY_VERSION: '2',
      AUTRE: 'ignorée',
    });
    if (!lecture.ok) throw new Error(lecture.erreurs.join());
    expect([...lecture.keys.masterKeys.keys()].sort()).toEqual([1, 2]);
    expect(lecture.keys.currentVersion).toBe(2);
    expect(lecture.keys.masterKeys.get(1)?.equals(v1)).toBe(true);
    expect(clesMaitressesParPriorite(lecture.keys)).toEqual([v2, v1]);
    expect(cleMaitresseCourante(lecture.keys).equals(v2)).toBe(true);
    const ancienne = lireClesDeChiffrement({
      ENCRYPTION_MASTER_KEY_V1: b64(v1),
      ENCRYPTION_MASTER_KEY_V2: b64(v2),
      ENCRYPTION_KEY_VERSION: '1',
    });
    expect(ancienne.ok && clesMaitressesParPriorite(ancienne.keys)).toEqual([v1, v2]);
  });

  it('une seule clé : elle est la version courante, sans ENCRYPTION_KEY_VERSION', () => {
    const lecture = lireClesDeChiffrement({ ENCRYPTION_MASTER_KEY_V2: b64(v2) });
    expect(lecture.ok && lecture.keys.currentVersion).toBe(2);
  });

  it('refuse de démarrer sans clé pour la version courante', () => {
    expect(erreurs({ ENCRYPTION_MASTER_KEY_V1: b64(v1), ENCRYPTION_KEY_VERSION: '2' })).toEqual([
      expect.stringMatching(/^ENCRYPTION_KEY_VERSION : aucune clé ENCRYPTION_MASTER_KEY_V2/),
    ]);
    expect(erreurs({})).toEqual([expect.stringMatching(/^ENCRYPTION_MASTER_KEY_V1 : obligatoire/)]);
    expect(erreurs({ ENCRYPTION_MASTER_KEY_V1: b64(v1), ENCRYPTION_KEY_VERSION: 'deux' })).toEqual([
      expect.stringMatching(/^ENCRYPTION_KEY_VERSION : version entière/),
    ]);
  });

  it('exige ENCRYPTION_KEY_VERSION dès qu’il y a plusieurs clés (bascule explicite)', () => {
    expect(
      erreurs({ ENCRYPTION_MASTER_KEY_V1: b64(v1), ENCRYPTION_MASTER_KEY_V2: b64(v2) }),
    ).toEqual([expect.stringMatching(/^ENCRYPTION_KEY_VERSION : obligatoire/)]);
  });

  it('refuse une clé mal formée sans jamais citer sa valeur', () => {
    const courte = b64(randomBytes(16));
    const pasBase64 = 'pas de la base64 !';
    const nonCanonique = `${b64(v2)}AAAA`;
    const liste = erreurs({
      ENCRYPTION_MASTER_KEY_V1: courte,
      ENCRYPTION_MASTER_KEY_V2: pasBase64,
      ENCRYPTION_MASTER_KEY_V3: nonCanonique,
      ENCRYPTION_MASTER_KEY_V04: b64(v1),
      ENCRYPTION_KEY_VERSION: '1',
    });
    expect(liste).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ENCRYPTION_MASTER_KEY_V1 : 32 octets en base64/),
        expect.stringMatching(/^ENCRYPTION_MASTER_KEY_V2 : 32 octets en base64/),
        expect.stringMatching(/^ENCRYPTION_MASTER_KEY_V3 : 32 octets en base64/),
        expect.stringMatching(/^ENCRYPTION_MASTER_KEY_V04 : nom attendu/),
      ]),
    );
    const texte = liste.join('\n');
    for (const secret of [courte, pasBase64, nonCanonique, b64(v1)]) {
      expect(texte).not.toContain(secret);
    }
  });
});
