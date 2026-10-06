import type { Permission } from '@scolaly/contracts';

/** Droits d'une personne dans une organisation, pour la requête en cours. */
export interface Perimetre {
  type: 'organisation' | 'etablissement' | 'formation' | 'promotion' | 'soi';
  id: string | null;
}

export interface Access {
  userId: string;
  organisationId: string;
  /** Fiche de la personne dans l'école (RG-00-26). */
  personneId: string;
  permissions: ReadonlySet<Permission>;
  /** Périmètres sur lesquels chaque permission s'exerce (filtrage par les services). */
  perimetres: ReadonlyMap<Permission, readonly Perimetre[]>;
  /** RG-00-13 : un rôle en cours exige la double authentification. */
  doubleAuthentificationExigee: boolean;
  /** Modules actifs de l'école (RG-19-04). */
  modules: ReadonlySet<string>;
  /** Accès de l'école selon l'état de son client (RG-19-02). */
  acces: 'complet' | 'lecture_seule' | 'ferme';
}

/**
 * Calcule les droits d'un compte dans l'organisation active de sa session : rattachement à
 * l'école (RG-00-26), rôles et périmètres (RG-01-14). Renvoie null si le compte n'a aucun droit
 * dans cette organisation. Un changement de droits s'applique à la requête suivante (RG-01-16).
 */
export interface AccessResolver {
  resolve(userId: string, activeOrganisationId: string | null): Promise<Access | null>;
}

export const ACCESS_RESOLVER = Symbol('ACCESS_RESOLVER');

/**
 * Résolution par défaut tant que les rôles et attributions n'existent pas (incrément I1.2) :
 * aucun droit. Une route protégée par permission est donc refusée.
 */
export class DenyAllAccessResolver implements AccessResolver {
  resolve(): Promise<Access | null> {
    return Promise.resolve(null);
  }
}
