import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { isUuid } from './ids.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Exécute `work` dans une transaction limitée à une organisation : l'équivalent de
 * `SET LOCAL app.organisation_id`, que les politiques RLS lisent via app_current_organisation_id().
 * Le réglage disparaît à la fin de la transaction, ce qui le rend sûr derrière PgBouncer.
 */
export async function withOrganisation<T>(
  db: Database,
  organisationId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!isUuid(organisationId)) {
    throw new Error(`Identifiant d'organisation invalide : ${organisationId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organisation_id', ${organisationId}, true)`);
    return work(tx);
  });
}
