/**
 * Tables sans `organisation_id` (ADR 0002). Toute autre table du schéma `public` doit être
 * cloisonnée : le contrôle du schéma et le test d'isolation l'exigent.
 * `organisation` est cloisonnée par son propre identifiant.
 */
export const PLATFORM_TABLES: readonly string[] = ['groupe'];
export const SELF_SCOPED_TABLES: readonly string[] = ['organisation'];
