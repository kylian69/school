import { organisation, organisationModule, withOrganisation, type Database } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import type { Access } from './access-resolver.js';

/**
 * Accès et modules actifs d'une école, lus sous RLS dans son propre contexte. Servira au
 * résolveur des droits (I1.2) : un changement fait par la console s'applique à la requête suivante.
 */
export async function chargerContexteEcole(
  db: Database,
  organisationId: string,
): Promise<Pick<Access, 'acces' | 'modules'> | null> {
  return withOrganisation(db, organisationId, async (tx) => {
    const [ecole] = await tx
      .select({ acces: organisation.acces })
      .from(organisation)
      .where(eq(organisation.id, organisationId));
    if (!ecole) return null;
    const modules = await tx
      .select({ module: organisationModule.module })
      .from(organisationModule)
      .where(eq(organisationModule.actif, true));
    return { acces: ecole.acces, modules: new Set(modules.map((m) => m.module)) };
  });
}
