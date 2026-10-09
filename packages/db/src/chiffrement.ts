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

  /** Version de la clé maîtresse utilisée pour chiffrer. */
  get currentVersion(): number {
    return this.keys.currentVersion;
  }

  /** Vrai si la valeur a été chiffrée avec une version antérieure (à rechiffrer). */
  needsReencryption(payload: string): boolean {
    return !payload.startsWith(`v${this.keys.currentVersion}.`);
  }

  /** Même valeur, chiffrée avec la version courante (rotation de la clé maîtresse). */
  reencrypt(payload: string, organisationId: string, context: string): string {
    return this.encrypt(this.decrypt(payload, organisationId, context), organisationId, context);
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

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const GENERER = 'générer avec `head -c 32 /dev/urandom | base64`';

export type LectureCles =
  { ok: true; keys: FieldEncryptionKeys } | { ok: false; erreurs: string[] };

/**
 * Lit et valide les clés injectées au démarrage (ADR 0002, ADR 0006) : toutes les variables
 * `ENCRYPTION_MASTER_KEY_V<n>` non vides (base64, 32 octets) et `ENCRYPTION_KEY_VERSION`, la
 * version utilisée pour chiffrer. Celle-ci est obligatoire dès qu'il y a plusieurs clés : la
 * bascule est toujours explicite. Les erreurs nomment la variable, jamais sa valeur.
 */
export function lireClesDeChiffrement(env: Readonly<Record<string, unknown>>): LectureCles {
  const erreurs: string[] = [];
  const masterKeys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('ENCRYPTION_MASTER_KEY_')) continue;
    if (typeof value !== 'string' || value === '') continue;
    const match = /^ENCRYPTION_MASTER_KEY_V([1-9]\d{0,5})$/.exec(name);
    if (!match?.[1]) {
      erreurs.push(`${name} : nom attendu ENCRYPTION_MASTER_KEY_V1, _V2… (version entière ≥ 1)`);
      continue;
    }
    const key = BASE64.test(value) ? Buffer.from(value, 'base64') : undefined;
    if (key?.length !== KEY_BYTES) {
      erreurs.push(`${name} : ${KEY_BYTES} octets en base64 attendus (${GENERER})`);
      continue;
    }
    masterKeys.set(Number(match[1]), key);
  }
  if (masterKeys.size === 0 && erreurs.length === 0) {
    erreurs.push(`ENCRYPTION_MASTER_KEY_V1 : obligatoire (${GENERER})`);
  }
  const brute = env.ENCRYPTION_KEY_VERSION;
  let currentVersion: number | undefined;
  if (brute === undefined || brute === '') {
    if (masterKeys.size === 1) [currentVersion] = masterKeys.keys();
    else if (masterKeys.size > 1) {
      erreurs.push(
        'ENCRYPTION_KEY_VERSION : obligatoire quand plusieurs clés maîtresses sont présentes (version utilisée pour chiffrer)',
      );
    }
  } else if (typeof brute === 'string' && /^[1-9]\d{0,5}$/.test(brute)) {
    currentVersion = Number(brute);
    if (!masterKeys.has(currentVersion)) {
      erreurs.push(
        `ENCRYPTION_KEY_VERSION : aucune clé ENCRYPTION_MASTER_KEY_V${currentVersion} pour la version courante`,
      );
    }
  } else {
    erreurs.push('ENCRYPTION_KEY_VERSION : version entière ≥ 1 attendue');
  }
  if (erreurs.length > 0 || currentVersion === undefined) return { ok: false, erreurs };
  return { ok: true, keys: { masterKeys, currentVersion } };
}

/** Clé maîtresse de la version courante (dérivation des clés de séance de l'émargement). */
export function cleMaitresseCourante(keys: FieldEncryptionKeys): Buffer {
  const key = keys.masterKeys.get(keys.currentVersion);
  if (!key) throw new FieldEncryptionError(`Clé maîtresse v${keys.currentVersion} absente.`);
  return key;
}

/**
 * Clés maîtresses, la version courante d'abord puis les autres de la plus récente à la plus
 * ancienne : on dérive avec la première, on vérifie avec chacune (clés de séance de l'émargement).
 */
export function clesMaitressesParPriorite(keys: FieldEncryptionKeys): Buffer[] {
  const autres = [...keys.masterKeys.keys()]
    .filter((version) => version !== keys.currentVersion)
    .sort((a, b) => b - a);
  return [keys.currentVersion, ...autres].flatMap((version) => {
    const key = keys.masterKeys.get(version);
    return key ? [key] : [];
  });
}
