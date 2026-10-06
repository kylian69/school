import { createHash, randomBytes } from 'node:crypto';
import { isUuid } from '@scolaly/db';

/**
 * Jeton d'invitation : `<identifiant de l'école>.<secret>`. L'identifiant ouvre la transaction de
 * l'école (RLS) ; seul le secret, dont on ne stocke que l'empreinte SHA-256, donne l'accès.
 */
export function nouveauJeton(organisationId: string): { jeton: string; empreinte: string } {
  const secret = randomBytes(32).toString('base64url');
  return { jeton: `${organisationId}.${secret}`, empreinte: empreinteDe(secret) };
}

export function lireJeton(jeton: string): { organisationId: string; empreinte: string } | null {
  const [organisationId, secret, ...reste] = jeton.split('.');
  if (
    !organisationId ||
    !secret ||
    reste.length > 0 ||
    !isUuid(organisationId) ||
    secret.length < 32
  ) {
    return null;
  }
  return { organisationId, empreinte: empreinteDe(secret) };
}

const empreinteDe = (secret: string) => createHash('sha256').update(secret).digest('hex');
