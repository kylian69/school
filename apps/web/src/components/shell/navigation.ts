import type { Permission } from '@scolaly/contracts';
import { PERMISSIONS_PARAMETRES } from '@/components/parametres/sections';
import { fr } from '@/i18n/fr';

/**
 * Entrées de navigation (maquettes, écran « Tableau de bord »). Une entrée n'apparaît que si son
 * module est actif pour l'organisation (RG-19-04) et que son écran existe : les autres modules
 * des maquettes (Apprenants, Emploi du temps, Émargement…) s'ajouteront ici avec leurs écrans.
 */
export interface NavigationEntry {
  label: string;
  href: string;
  /** Module requis ; null pour une entrée toujours présente. */
  module: string | null;
  /** Permissions dont l'une suffit à voir l'entrée ; absente pour une entrée ouverte à tous. */
  permissions?: readonly Permission[];
  /** Tracé SVG de l'icône (24 × 24), repris des maquettes. */
  icon: string;
}

/** L'entrée est-elle visible avec ces modules et ces permissions ? */
export const entreeVisible = (
  entry: NavigationEntry,
  modules: readonly string[],
  permissions: readonly string[],
) =>
  (entry.module === null || modules.includes(entry.module)) &&
  (!entry.permissions || entry.permissions.some((p) => permissions.includes(p)));

export const NAVIGATION: readonly NavigationEntry[] = [
  {
    label: fr.coquille.entrees.tableauDeBord,
    href: '/',
    module: null,
    icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  },
  {
    label: fr.coquille.entrees.parametres,
    href: '/parametres',
    module: 'socle',
    permissions: PERMISSIONS_PARAMETRES,
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
  },
];
