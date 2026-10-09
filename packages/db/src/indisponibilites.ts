import { and, isNotNull, lte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { withOrganisation } from './organisation-context.js';
import { indisponibiliteIntervenant } from './schema/index.js';

export interface BilanConservationIndisponibilites {
  motifsEffaces: number;
  lignesSupprimees: number;
}

/**
 * RG-04-18, conservation : efface le motif des indisponibilités terminées au plus tard à
 * `motifLimite` et supprime celles terminées au plus tard à `ligneLimite` (corbeille comprise).
 * Les limites viennent de packages/referentials (durees-conservation). Idempotent ; une
 * transaction par école, sous RLS.
 */
export async function purgerIndisponibilites(
  db: Database,
  limites: { motifLimite: Date; ligneLimite: Date },
): Promise<BilanConservationIndisponibilites> {
  const ecoles = await db.execute<{ organisation_id: string }>(
    sql`select organisation_id from indisponibilites_a_purger(${limites.motifLimite.toISOString()}::timestamptz, ${limites.ligneLimite.toISOString()}::timestamptz)`,
  );
  const bilan: BilanConservationIndisponibilites = { motifsEffaces: 0, lignesSupprimees: 0 };
  for (const { organisation_id: organisationId } of ecoles.rows) {
    await withOrganisation(db, organisationId, async (tx) => {
      const supprimees = await tx
        .delete(indisponibiliteIntervenant)
        .where(lte(indisponibiliteIntervenant.fin, limites.ligneLimite))
        .returning({ id: indisponibiliteIntervenant.id });
      const effaces = await tx
        .update(indisponibiliteIntervenant)
        .set({ motifChiffre: null })
        .where(
          and(
            lte(indisponibiliteIntervenant.fin, limites.motifLimite),
            isNotNull(indisponibiliteIntervenant.motifChiffre),
          ),
        )
        .returning({ id: indisponibiliteIntervenant.id });
      bilan.lignesSupprimees += supprimees.length;
      bilan.motifsEffaces += effaces.length;
    });
  }
  return bilan;
}
