import { SetMetadata } from '@nestjs/common';
import type { Permission, Scope } from '@scolaly/contracts';

/**
 * Première barrière (architecture section 4) : chaque route déclare qui peut l'appeler.
 * Une route sans déclaration empêche l'API de démarrer.
 */
export const ACCESS_RULE = 'scolaly:access-rule';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permission'; permission: Permission; scope: Scope };

/** Route ouverte sans session (santé, pages publiques). À justifier en revue. */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** Route réservée à une personne connectée, hors de toute organisation (ex. « mes écoles »). */
export const Authenticated = () =>
  SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);

/**
 * Route qui exige une permission dans l'organisation active de la session. Le traitement
 * s'exécute alors dans une transaction limitée à cette organisation (RLS).
 */
export const RequirePermission = (permission: Permission, scope: Scope = 'organisation') =>
  SetMetadata(ACCESS_RULE, { kind: 'permission', permission, scope } satisfies AccessRule);
