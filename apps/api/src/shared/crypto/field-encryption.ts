import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Chiffrement applicatif par champ (architecture section 3, ADR 0002) : AES-256-GCM, avec une clé
 * par organisation dérivée par HKDF-SHA-256 d'une clé maîtresse versionnée, jamais stockée.
 *
 * Format : `v<version>.<iv>.<texte chiffré>.<étiquette>` en base64url. Les données associées
 * (organisation, puis contexte du champ, par exemple `personne.nir`) lient la valeur à sa place :
 * une valeur recopiée dans une autre organisation ou un autre champ ne se déchiffre pas.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
/** Étiquette d'authentification complète (16 octets), imposée au déchiffrement : pas de troncature. */
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const HKDF_SALT = Buffer.from('scolaly/field-encryption/v1');

export class FieldEncryptionError extends Error {
  override name = 'FieldEncryptionError';
}

export interface FieldEncryptionKeys {
  /** Clés maîtresses par version, 32 octets chacune. */
  masterKeys: ReadonlyMap<number, Buffer>;
  /** Version utilisée pour chiffrer les nouvelles valeurs. */
  currentVersion: number;
}

export class FieldEncryption {
  private readonly derived = new Map<string, Buffer>();

  constructor(private readonly keys: FieldEncryptionKeys) {
    if (!keys.masterKeys.has(keys.currentVersion)) {
      throw new FieldEncryptionError(`Clé maîtresse v${keys.currentVersion} absente.`);
    }
    for (const [version, key] of keys.masterKeys) {
      if (key.length !== KEY_BYTES) {
        throw new FieldEncryptionError(
          `La clé maîtresse v${version} doit faire ${KEY_BYTES} octets.`,
        );
      }
    }
  }

  encrypt(plaintext: string, organisationId: string, context: string): string {
    const version = this.keys.currentVersion;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(version, organisationId), iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(aad(organisationId, context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [`v${version}`, iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string, organisationId: string, context: string): string {
    const [versionPart, ivPart, dataPart, tagPart, ...rest] = payload.split('.');
    const version = Number(versionPart?.slice(1));
    if (
      !versionPart?.startsWith('v') ||
      !Number.isInteger(version) ||
      !ivPart ||
      dataPart === undefined ||
      !tagPart ||
      rest.length > 0
    ) {
      throw new FieldEncryptionError('Valeur chiffrée mal formée.');
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key(version, organisationId),
        Buffer.from(ivPart, 'base64url'),
        { authTagLength: AUTH_TAG_BYTES },
      );
      decipher.setAAD(aad(organisationId, context));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof FieldEncryptionError) throw error;
      throw new FieldEncryptionError('Déchiffrement impossible : valeur altérée ou mauvaise clé.');
    }
  }

  /** Vrai si la valeur a été chiffrée avec une version antérieure (à rechiffrer). */
  needsReencryption(payload: string): boolean {
    return !payload.startsWith(`v${this.keys.currentVersion}.`);
  }

  private key(version: number, organisationId: string): Buffer {
    const cacheKey = `${version}:${organisationId}`;
    let key = this.derived.get(cacheKey);
    if (!key) {
      const master = this.keys.masterKeys.get(version);
      if (!master) throw new FieldEncryptionError(`Clé maîtresse v${version} absente.`);
      key = Buffer.from(
        hkdfSync('sha256', master, HKDF_SALT, `organisation:${organisationId}`, KEY_BYTES),
      );
      this.derived.set(cacheKey, key);
    }
    return key;
  }
}

const aad = (organisationId: string, context: string) =>
  Buffer.from(`${organisationId}|${context}`, 'utf8');

/**
 * Lit les clés depuis l'environnement (injectées par le coffre de secrets) :
 * `ENCRYPTION_MASTER_KEY_V1`, `_V2`… en base64 (32 octets), et `ENCRYPTION_KEY_VERSION`.
 */
export function keysFromEnv(env: NodeJS.ProcessEnv): FieldEncryptionKeys {
  const masterKeys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    const match = /^ENCRYPTION_MASTER_KEY_V(\d+)$/.exec(name);
    if (match?.[1] && value) masterKeys.set(Number(match[1]), Buffer.from(value, 'base64'));
  }
  const currentVersion = Number(env.ENCRYPTION_KEY_VERSION ?? Math.max(0, ...masterKeys.keys()));
  return { masterKeys, currentVersion };
}
