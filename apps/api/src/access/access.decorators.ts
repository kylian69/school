import { SetMetadata } from '@nestjs/common';
import type { ModuleCode, Permission, RolePlateforme, Scope } from '@scolaly/contracts';

/**
 * Première barrière (architecture section 4) : chaque route déclare qui peut l'appeler.
 * Une route sans déclaration empêche l'API de démarrer.
 */
export const ACCESS_RULE = 'scolaly:access-rule';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permission'; permissions: readonly Permission[]; scope: Scope }
  | { kind: 'plateforme'; roles: readonly RolePlateforme[] };

/** Route ouverte sans session (santé, pages publiques). À justifier en revue. */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** Route réservée à une personne connectée, hors de toute organisation (ex. « mes écoles »). */
export const Authenticated = () =>
  SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);

/**
 * Route qui exige une permission dans l'organisation active de la session. Le traitement
 * s'exécute alors dans une transaction limitée à cette organisation (RLS).
 */
export const RequirePermission = (
  permission: Permission | readonly Permission[],
  scope: Scope = 'organisation',
) =>
  SetMetadata(ACCESS_RULE, {
    kind: 'permission',
    // Plusieurs permissions : l'une d'elles suffit.
    permissions: typeof permission === 'string' ? [permission] : permission,
    scope,
  } satisfies AccessRule);

/**
 * Route de la console de la plateforme (module 19), réservée aux membres de l'équipe Scolaly
 * qui ont l'un des rôles indiqués. N'existe qu'en mode SaaS.
 */
export const Plateforme = (...roles: RolePlateforme[]) =>
  SetMetadata(ACCESS_RULE, { kind: 'plateforme', roles } satisfies AccessRule);

/** Module fonctionnel d'une route : inactif pour l'école, la route ne répond pas (RG-19-04). */
export const MODULE_REQUIS = 'scolaly:module-requis';
export const ModuleRequis = (module: ModuleCode) => SetMetadata(MODULE_REQUIS, module);
