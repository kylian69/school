import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Jeton d'adresse signée de courte durée (architecture, section 4 : liens signés) : charge en JSON
 * encodée en base64url, puis signature HMAC-SHA256 avec une clé dérivée de la clé maîtresse pour un
 * seul usage. Le jeton n'est pas chiffré : n'y mettre aucune donnée personnelle.
 */
export class UrlSignee {
  private readonly cle: Buffer;

  constructor(cleMaitresse: Buffer, usage: string) {
    this.cle = Buffer.from(hkdfSync('sha256', cleMaitresse, 'scolaly/url-signee/v1', usage, 32));
  }

  private signature(corps: string) {
    return createHmac('sha256', this.cle).update(corps).digest('base64url');
  }

  signer(charge: Record<string, string>, expireLeMs: number): string {
    const corps = Buffer.from(JSON.stringify({ ...charge, exp: expireLeMs })).toString('base64url');
    return `${corps}.${this.signature(corps)}`;
  }

  /** Charge du jeton, ou null s'il est altéré, mal formé ou expiré. */
  verifier(jeton: string, maintenantMs = Date.now()): Record<string, unknown> | null {
    const [corps, signature, ...reste] = jeton.split('.');
    if (!corps || !signature || reste.length > 0) return null;
    const attendue = Buffer.from(this.signature(corps));
    const recue = Buffer.from(signature);
    if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return null;
    try {
      const charge = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8')) as unknown;
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
