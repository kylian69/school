/**
 * Calcul des droits (RG-00-10, RG-00-11, RG-01-14) : une attribution relie une personne, un rôle
 * et un périmètre, pour une période. Les rôles se cumulent ; sans attribution, aucun droit.
 */
export type TypePerimetre = 'organisation' | 'etablissement' | 'formation' | 'promotion' | 'soi';

export interface Perimetre {
  type: TypePerimetre;
  /** Identifiant de l'établissement, de la formation ou de la promotion ; null sinon. */
  id: string | null;
}

export interface AttributionEffective {
  roleCode: string | null;
  permissions: readonly string[];
  doubleAuthentificationRequise: boolean;
  perimetre: Perimetre;
  /** Dates légales AAAA-MM-JJ ; fin exclue, null si sans fin. */
  debut: string;
  fin: string | null;
}

export const estEnCours = (
  attribution: Pick<AttributionEffective, 'debut' | 'fin'>,
  date: string,
) => attribution.debut <= date && (attribution.fin === null || date < attribution.fin);

/** Permissions en vigueur à une date, avec les périmètres sur lesquels elles s'exercent. */
export function permissionsEffectives(
  attributions: readonly AttributionEffective[],
  date: string,
): Map<string, Perimetre[]> {
  const resultat = new Map<string, Perimetre[]>();
  for (const attribution of attributions) {
    if (!estEnCours(attribution, date)) continue;
    for (const permission of attribution.permissions) {
      const perimetres = resultat.get(permission) ?? [];
      const doublon = perimetres.some(
        (p) => p.type === attribution.perimetre.type && p.id === attribution.perimetre.id,
      );
      if (!doublon) perimetres.push(attribution.perimetre);
      resultat.set(permission, perimetres);
    }
  }
  return resultat;
}

/** RG-00-13 : la double authentification est exigée dès qu'un rôle en cours l'exige. */
export function doubleAuthentificationExigee(
  attributions: readonly AttributionEffective[],
  date: string,
): boolean {
  return attributions.some((a) => a.doubleAuthentificationRequise && estEnCours(a, date));
}

export type RefusAttribution = 'dernier-administrateur' | 'reserve-aux-administrateurs';

/**
 * RG-01-12 : seul un administrateur attribue ou retire le rôle d'administrateur, et il reste
 * toujours au moins un administrateur actif dans l'organisation.
 */
export function verifierChangementAdministrateur(options: {
  auteurEstAdministrateur: boolean;
  concerneAdministrateur: boolean;
  /** Administrateurs actifs (comptes actifs, attribution en cours) après le changement. */
  administrateursActifsApres: number;
}): { ok: true } | { ok: false; refus: RefusAttribution } {
  if (!options.concerneAdministrateur) return { ok: true };
  if (!options.auteurEstAdministrateur) return { ok: false, refus: 'reserve-aux-administrateurs' };
  if (options.administrateursActifsApres < 1) return { ok: false, refus: 'dernier-administrateur' };
  return { ok: true };
}
