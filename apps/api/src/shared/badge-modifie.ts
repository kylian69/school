import { organisation, type Transaction } from '@scolaly/db';
import { eq, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';

/**
 * RG-04-14 : jours d'affichage du badge « modifié » choisis par l'école de la session, ou la
 * valeur par défaut de l'instance.
 */
export async function dureeBadgeModifie(
  tx: Transaction,
  env: Pick<Env, 'EDT_BADGE_MODIFIE_JOURS'>,
): Promise<number> {
  const [ecole] = await tx
    .select({ jours: organisation.edtBadgeModifieJours })
    .from(organisation)
    .where(eq(organisation.id, sql`app_current_organisation_id()`));
  return ecole?.jours ?? env.EDT_BADGE_MODIFIE_JOURS;
}
