import type { ContexteConflits, SeancePlanifiee, TypeSeance } from './conflits.js';

/**
 * RG-04-16 : volume d'un module à placer pour un public, par type de séance. Le planifié compte
 * les brouillons et les séances publiées (comme le contrôle de volume de RG-04-05) : une séance
 * placée sur la grille n'est plus « à placer ». Le restant est négatif en cas de dépassement.
 */
export interface VolumeAPlacer {
  moduleId: string;
  type: TypeSeance;
  prevuMinutes: number;
  planifieMinutes: number;
  restantMinutes: number;
}

const TYPES: readonly TypeSeance[] = ['cm', 'td', 'tp', 'projet', 'examen'];

/**
 * Pour chaque module (dans l'ordre donné) et chaque type prévu ou déjà planifié : heures de la
 * maquette, heures placées pour l'un des publics donnés (une séance n'est comptée qu'une fois),
 * heures restantes.
 */
export function volumesAPlacer(
  moduleIds: readonly string[],
  volumes: ContexteConflits['volumesModules'],
  seances: readonly SeancePlanifiee[],
  publicIds: readonly string[],
): VolumeAPlacer[] {
  const placees = seances.filter(
    (s) =>
      (s.statut === 'brouillon' || s.statut === 'publiee') &&
      s.groupeIds.some((id) => publicIds.includes(id)),
  );
  const resultat: VolumeAPlacer[] = [];
  for (const moduleId of moduleIds) {
    const prevus = volumes[moduleId] ?? {};
    for (const type of TYPES) {
      const prevuMinutes = prevus[type] ?? 0;
      const planifieMinutes = placees
        .filter((s) => s.moduleId === moduleId && s.type === type)
        .reduce((total, s) => total + (s.fin.getTime() - s.debut.getTime()) / 60_000, 0);
      if (prevuMinutes > 0 || planifieMinutes > 0)
        resultat.push({
          moduleId,
          type,
          prevuMinutes,
          planifieMinutes,
          restantMinutes: prevuMinutes - planifieMinutes,
        });
    }
  }
  return resultat;
}
