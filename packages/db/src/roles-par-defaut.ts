import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { Transaction } from './organisation-context.js';
import { newId } from './ids.js';

/** Définition d'un rôle par défaut, telle que fournie par packages/contracts. */
export interface DefinitionRole {
  code: string;
  libelle: string;
  description: string;
  perimetre: string;
  doubleAuthentificationRequise: boolean;
  permissions: readonly string[];
}

/**
 * Crée les rôles par défaut d'une organisation (RG-01-15), de façon idempotente, par la fonction
 * dédiée : utilisable par la console de la plateforme (ADR 0004) comme par le propriétaire.
 * Renvoie le nombre de rôles créés.
 */
export async function initialiserRolesParDefaut(
  db: Database | Transaction,
  organisationId: string,
  roles: readonly DefinitionRole[],
): Promise<number> {
  const charge = roles.map((r) => ({
    id: newId(),
    code: r.code,
    libelle: r.libelle,
    description: r.description,
    perimetre: r.perimetre,
    doubleAuthentification: r.doubleAuthentificationRequise,
    permissions: r.permissions.map((permission) => ({ id: newId(), permission })),
  }));
  const result = await db.execute<{ crees: number }>(
    sql`select organisation_initialiser_roles(${organisationId}::uuid, ${JSON.stringify(charge)}::jsonb) as crees`,
  );
  return result.rows[0]?.crees ?? 0;
}
