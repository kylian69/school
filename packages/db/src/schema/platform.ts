/**
 * Tables sans `organisation_id` (ADR 0002). Toute autre table du schéma `public` doit être
 * cloisonnée : le contrôle du schéma et le test d'isolation l'exigent.
 */

/** Lues par l'application, modifiées seulement par la console de la plateforme. */
export const PLATFORM_READONLY_TABLES: readonly string[] = ['groupe'];

/** Tables de Better Auth, lues et écrites uniquement par le module d'authentification. */
export const AUTH_TABLES: readonly string[] = [
  'auth_user',
  'auth_session',
  'auth_account',
  'auth_verification',
];

export const PLATFORM_TABLES: readonly string[] = [...PLATFORM_READONLY_TABLES, ...AUTH_TABLES];

/** `organisation` est cloisonnée par son propre identifiant. */
export const SELF_SCOPED_TABLES: readonly string[] = ['organisation'];
