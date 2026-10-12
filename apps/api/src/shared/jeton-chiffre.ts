import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Jeton d'adresse de courte durée dont la charge reste illisible (architecture, section 4 : liens
 * signés) : JSON chiffré et authentifié en AES-256-GCM, avec une clé dérivée de la clé maîtresse
 * pour un seul usage. Contrairement à UrlSignee, la charge peut porter un nom de fichier personnel :
 * l'adresse peut finir dans un historique ou un journal de relais sans le dévoiler.
 */
export class JetonChiffre {
  private readonly cle: Buffer;

  constructor(cleMaitresse: Buffer, usage: string) {
    this.cle = Buffer.from(hkdfSync('sha256', cleMaitresse, 'scolaly/jeton-chiffre/v1', usage, 32));
  }

  emettre(charge: Record<string, unknown>, expireLeMs: number): string {
    const iv = randomBytes(12);
    const chiffreur = createCipheriv('aes-256-gcm', this.cle, iv, { authTagLength: 16 });
    const clair = Buffer.from(JSON.stringify({ ...charge, exp: expireLeMs }));
    const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()]);
    return Buffer.concat([iv, chiffreur.getAuthTag(), chiffre]).toString('base64url');
  }

  /** Charge du jeton, ou null s'il est altéré, mal formé, émis pour un autre usage ou expiré. */
  lire(jeton: string, maintenantMs = Date.now()): Record<string, unknown> | null {
    if (!/^[A-Za-z0-9_-]+$/.test(jeton)) return null;
    const octets = Buffer.from(jeton, 'base64url');
    if (octets.length <= 28) return null;
    try {
      const dechiffreur = createDecipheriv('aes-256-gcm', this.cle, octets.subarray(0, 12), {
        authTagLength: 16,
      });
      dechiffreur.setAuthTag(octets.subarray(12, 28));
      const clair = Buffer.concat([dechiffreur.update(octets.subarray(28)), dechiffreur.final()]);
      const charge = JSON.parse(clair.toString('utf8')) as unknown;
      if (typeof charge !== 'object' || charge === null) return null;
      const { exp } = charge as { exp?: unknown };
      return typeof exp === 'number' && exp >= maintenantMs
        ? (charge as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
