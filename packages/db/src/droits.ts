import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { Transaction } from './organisation-context.js';
import { attribution, personne, role, rolePermission } from './schema/index.js';

export interface EcoleDuCompte {
  organisationId: string;
  nom: string;
  nomAffichage: string;
  acces: 'complet' | 'lecture_seule' | 'ferme';
}

/** Écoles où le compte a une fiche (fonction dédiée, lecture transverse limitée). */
export async function ecolesDuCompte(db: Database, userId: string): Promise<EcoleDuCompte[]> {
  const result = await db.execute<{
    organisation_id: string;
    nom: string;
    nom_affichage: string;
    acces: EcoleDuCompte['acces'];
  }>(sql`select * from ecoles_du_compte(${userId}::uuid)`);
  return result.rows.map((r) => ({
    organisationId: r.organisation_id,
    nom: r.nom,
    nomAffichage: r.nom_affichage,
    acces: r.acces,
  }));
}

export interface AttributionDuCompte {
  personneId: string;
  roleCode: string | null;
  doubleAuthentificationRequise: boolean;
  perimetreType: 'organisation' | 'etablissement' | 'formation' | 'promotion' | 'soi';
  perimetreId: string | null;
  debut: string;
  fin: string | null;
  permissions: string[];
}

/**
 * Fiche et attributions d'un compte dans l'école de la transaction (RLS). Renvoie null si le
 * compte n'a pas de fiche dans cette école.
 */
export async function attributionsDuCompte(
  tx: Transaction,
  userId: string,
): Promise<{ personneId: string; attributions: AttributionDuCompte[] } | null> {
  const [fiche] = await tx
    .select({ id: personne.id })
    .from(personne)
    .where(and(eq(personne.userId, userId), isNull(personne.deletedAt)));
  if (!fiche) return null;
  const lignes = await tx
    .select({
      attributionId: attribution.id,
      roleCode: role.code,
      doubleAuthentificationRequise: role.doubleAuthentificationRequise,
      perimetreType: attribution.perimetreType,
      perimetreId: attribution.perimetreId,
      debut: attribution.debut,
      fin: attribution.fin,
      permission: rolePermission.permission,
    })
    .from(attribution)
    .innerJoin(role, and(eq(role.id, attribution.roleId), isNull(role.deletedAt)))
    .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
    .where(and(eq(attribution.personneId, fiche.id), isNull(attribution.deletedAt)));

  const parAttribution = new Map<string, AttributionDuCompte>();
  for (const ligne of lignes) {
    const existante = parAttribution.get(ligne.attributionId);
    if (existante) {
      if (ligne.permission) existante.permissions.push(ligne.permission);
      continue;
    }
    parAttribution.set(ligne.attributionId, {
      personneId: fiche.id,
      roleCode: ligne.roleCode,
      doubleAuthentificationRequise: ligne.doubleAuthentificationRequise,
      perimetreType: ligne.perimetreType,
      perimetreId: ligne.perimetreId,
      debut: ligne.debut,
      fin: ligne.fin,
      permissions: ligne.permission ? [ligne.permission] : [],
    });
  }
  return { personneId: fiche.id, attributions: [...parAttribution.values()] };
}
