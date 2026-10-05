import { pgRole } from 'drizzle-orm/pg-core';

/**
 * Rôles PostgreSQL (architecture, section 3) :
 * - `scolaly_migrator` possède le schéma et applique les migrations ;
 * - `scolaly_app` est le rôle de l'application : ni superutilisateur, ni BYPASSRLS, ni propriétaire
 *   des tables, il est donc toujours soumis aux politiques RLS ;
 * - `scolaly_platform` est le rôle de la console de la plateforme (ADR 0004) : droits accordés
 *   table par table, aucun accès aux données des écoles.
 */
export const MIGRATOR_ROLE = 'scolaly_migrator';
export const APP_ROLE = 'scolaly_app';
export const PLATFORM_ROLE = 'scolaly_platform';

export const appRole = pgRole(APP_ROLE).existing();
export const platformRole = pgRole(PLATFORM_ROLE).existing();
