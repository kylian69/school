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
  /** Tracé SVG de l'icône (24 × 24), repris des maquettes. */
  icon: string;
}

export const NAVIGATION: readonly NavigationEntry[] = [
  {
    label: fr.coquille.entrees.tableauDeBord,
    href: '/',
    module: null,
    icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  },
];
