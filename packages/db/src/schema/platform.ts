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
  'auth_two_factor',
];

/** Tables privées de la console (ADR 0004) : aucun droit pour le rôle applicatif. */
export const PLATFORM_PRIVATE_TABLES: readonly string[] = [
  'client',
  'contrat',
  'client_etat_evenement',
  'plateforme_membre',
  'plateforme_audit',
];

export const PLATFORM_TABLES: readonly string[] = [
  ...PLATFORM_READONLY_TABLES,
  ...AUTH_TABLES,
  ...PLATFORM_PRIVATE_TABLES,
];

/** Tables d'école auxquelles le rôle plateforme a accès (ADR 0004) ; aucune autre. */
export const PLATFORM_ROLE_SCHOOL_TABLES: readonly string[] = [
  'organisation',
  'organisation_module',
];

/** `organisation` est cloisonnée par son propre identifiant. */
export const SELF_SCOPED_TABLES: readonly string[] = ['organisation'];
