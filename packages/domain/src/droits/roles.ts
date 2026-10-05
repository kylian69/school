/**
 * Gestion des rôles (US-01-10 ; RG-01-14, RG-01-15). Le rôle d'administrateur est verrouillé :
 * lui retirer une permission pourrait priver l'école de toute administration (RG-01-12).
 */
export const CODE_ADMINISTRATEUR = 'administrateur';

export interface RoleGere {
  /** Code d'un rôle par défaut ; null pour un rôle personnalisé. */
  code: string | null;
  doubleAuthentificationRequise: boolean;
}

export type RefusRole =
  | 'role-verrouille'
  | 'role-par-defaut'
  | 'permission-inconnue'
  | 'role-attribue'
  | 'double-authentification-imposee';

type Verdict = { ok: true } | { ok: false; refus: RefusRole };

export const estRoleParDefaut = (role: Pick<RoleGere, 'code'>) => role.code !== null;
export const estRoleVerrouille = (role: Pick<RoleGere, 'code'>) =>
  role.code === CODE_ADMINISTRATEUR;

/** Modification d'un rôle : permissions connues, administrateur intouchable. */
export function verifierModificationRole(
  role: RoleGere,
  changement: {
    permissions?: readonly string[] | undefined;
    doubleAuthentificationRequise?: boolean | undefined;
  },
  catalogue: ReadonlySet<string>,
): Verdict {
  if (estRoleVerrouille(role)) return { ok: false, refus: 'role-verrouille' };
  if (changement.permissions?.some((p) => !catalogue.has(p))) {
    return { ok: false, refus: 'permission-inconnue' };
  }
  // RG-00-13 : l'exigence des rôles par défaut est une règle du cahier des charges.
  if (
    estRoleParDefaut(role) &&
    changement.doubleAuthentificationRequise !== undefined &&
    changement.doubleAuthentificationRequise !== role.doubleAuthentificationRequise
  ) {
    return { ok: false, refus: 'double-authentification-imposee' };
  }
  return { ok: true };
}

/** RG-01-15 : seuls les rôles personnalisés se suppriment, et seulement s'ils ne servent plus. */
export function verifierSuppressionRole(
  role: Pick<RoleGere, 'code'>,
  attributionsEnCoursOuAVenir: number,
): Verdict {
  if (estRoleParDefaut(role)) return { ok: false, refus: 'role-par-defaut' };
  if (attributionsEnCoursOuAVenir > 0) return { ok: false, refus: 'role-attribue' };
  return { ok: true };
}
