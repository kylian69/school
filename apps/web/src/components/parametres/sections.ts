import type { Permission } from '@scolaly/contracts';
import { fr } from '@/i18n/fr';

/** Sections du menu « Paramètres » (module 01, section 5), chacune réservée à ses permissions. */
export interface SectionParametres {
  label: string;
  href: string;
  permissions: readonly Permission[];
}

export const SECTIONS_PARAMETRES: readonly SectionParametres[] = [
  {
    label: fr.parametres.sections.organisation,
    href: '/parametres/organisation',
    permissions: ['organisation:lire', 'organisation:modifier'],
  },
  {
    label: fr.parametres.sections.roles,
    href: '/parametres/roles',
    permissions: ['roles:gerer', 'roles:attribuer'],
  },
];

export const sectionsVisibles = (permissions: readonly string[]) =>
  SECTIONS_PARAMETRES.filter((s) => s.permissions.some((p) => permissions.includes(p)));

/** Permissions qui ouvrent le menu « Paramètres » : celles de l'une de ses sections. */
export const PERMISSIONS_PARAMETRES: readonly Permission[] = [
  ...new Set(SECTIONS_PARAMETRES.flatMap((s) => s.permissions)),
];
