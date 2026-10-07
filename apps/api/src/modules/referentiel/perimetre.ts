import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Permission } from '@scolaly/contracts';
import { formationEtablissement, type Transaction } from '@scolaly/db';
import { inArray } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

/**
 * Seconde barrière du référentiel (RG-00-10, module 02 section 2) : une permission s'exerce sur
 * toute l'école, sur les formations dispensées dans un établissement, ou sur une formation.
 * Renvoie null pour toute l'école, sinon les formations couvertes.
 */
export async function formationsCouvertes(
  tx: Transaction,
  access: Access,
  permissions: readonly Permission[],
): Promise<Set<string> | null> {
  const perimetres = permissions.flatMap((p) => access.perimetres.get(p) ?? []);
  if (perimetres.some((p) => p.type === 'organisation')) return null;
  const ids = new Set(perimetres.filter((p) => p.type === 'formation').flatMap((p) => p.id ?? []));
  const etablissements = etablissementsCouverts(access, permissions);
  if (etablissements.length > 0) {
    const dispensees = await tx
      .select({ formationId: formationEtablissement.formationId })
      .from(formationEtablissement)
      .where(inArray(formationEtablissement.etablissementId, etablissements));
    for (const { formationId } of dispensees) ids.add(formationId);
  }
  return ids;
}

/** Établissements du périmètre « établissement » d'une permission. */
export function etablissementsCouverts(
  access: Access,
  permissions: readonly Permission[],
): string[] {
  return permissions
    .flatMap((p) => access.perimetres.get(p) ?? [])
    .filter((p) => p.type === 'etablissement')
    .flatMap((p) => p.id ?? []);
}

export const LECTURE: readonly Permission[] = [
  'referentiel:lire',
  'referentiel:gerer',
  'referentiel:publier',
];

export const couvre = (couvertes: Set<string> | null, formationId: string) =>
  couvertes === null || couvertes.has(formationId);

/** Droits d'une personne sur une formation : lecture (sinon 404), modification, publication. */
export async function droitsSurFormation(tx: Transaction, access: Access, formationId: string) {
  // Requêtes successives : une transaction ne traite qu'une requête à la fois.
  const lecture = await formationsCouvertes(tx, access, LECTURE);
  const gestion = await formationsCouvertes(tx, access, ['referentiel:gerer']);
  const publication = await formationsCouvertes(tx, access, ['referentiel:publier']);
  if (!couvre(lecture, formationId)) throw new NotFoundException('Formation introuvable.');
  return {
    modifiable: access.permissions.has('referentiel:gerer') && couvre(gestion, formationId),
    publiable: access.permissions.has('referentiel:publier') && couvre(publication, formationId),
  };
}

export const HORS_PERIMETRE =
  'Cette formation est hors de votre périmètre : demandez à un administrateur ou au responsable de la formation.';

export function exigerModification(droits: { modifiable: boolean }): void {
  if (!droits.modifiable) throw new ForbiddenException(HORS_PERIMETRE);
}
