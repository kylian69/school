import { NotFoundException } from '@nestjs/common';
import type { Permission } from '@scolaly/contracts';
import { promotion, type Transaction } from '@scolaly/db';
import { and, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

export const LECTURE_PROMOTIONS: readonly Permission[] = ['promotions:lire', 'promotions:gerer'];

/**
 * Seconde barrière des promotions (RG-00-10) : toute l'école ; les promotions d'un établissement
 * ou d'une formation ; ou une promotion. Renvoie null pour toute l'école.
 */
export async function promotionsCouvertes(
  tx: Transaction,
  access: Access,
  permissions: readonly Permission[],
): Promise<Set<string> | null> {
  const perimetres = permissions.flatMap((p) => access.perimetres.get(p) ?? []);
  if (perimetres.some((p) => p.type === 'organisation')) return null;
  const ids = (type: string) =>
    perimetres.filter((p) => p.type === type).flatMap((p) => (p.id ? [p.id] : []));
  const couvertes = new Set(ids('promotion'));
  const conditions: SQL[] = [];
  if (ids('etablissement').length > 0) {
    conditions.push(inArray(promotion.etablissementId, ids('etablissement')));
  }
  if (ids('formation').length > 0)
    conditions.push(inArray(promotion.formationId, ids('formation')));
  if (conditions.length > 0) {
    const lignes = await tx
      .select({ id: promotion.id })
      .from(promotion)
      .where(and(isNull(promotion.deletedAt), or(...conditions)));
    for (const { id } of lignes) couvertes.add(id);
  }
  return couvertes;
}

export const couvrePromotion = (couvertes: Set<string> | null, id: string) =>
  couvertes === null || couvertes.has(id);

/** Lecture (sinon 404) et droit de gestion d'une promotion. */
export async function droitsSurPromotion(tx: Transaction, access: Access, id: string) {
  const lecture = await promotionsCouvertes(tx, access, LECTURE_PROMOTIONS);
  if (!couvrePromotion(lecture, id)) throw new NotFoundException('Promotion introuvable.');
  const gestion = access.permissions.has('promotions:gerer')
    ? await promotionsCouvertes(tx, access, ['promotions:gerer'])
    : new Set<string>();
  return { modifiable: couvrePromotion(gestion, id) };
}
