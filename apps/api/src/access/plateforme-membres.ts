import type { RolePlateforme } from '@scolaly/contracts';

/** Rôle d'un compte dans l'équipe Scolaly, ou null s'il n'en fait pas partie. */
export interface PlateformeMembres {
  roleDe(userId: string): Promise<RolePlateforme | null>;
}

export const PLATEFORME_MEMBRES = Symbol('PLATEFORME_MEMBRES');
