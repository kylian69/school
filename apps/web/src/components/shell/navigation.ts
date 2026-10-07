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
  /** Entrée réservée à qui suit une formation ou enseigne dans l'école (module 02). */
  parcours?: 'apprenant' | 'intervenant';
  /** Tracé SVG de l'icône (24 × 24), repris des maquettes. */
  icon: string;
}

/** L'entrée est-elle visible avec ces modules et ces permissions ? */
export const entreeVisible = (
  entry: NavigationEntry,
  modules: readonly string[],
  permissions: readonly string[],
  parcours: { apprenant: boolean; intervenant: boolean } = { apprenant: false, intervenant: false },
) =>
  (entry.module === null || modules.includes(entry.module)) &&
  (!entry.permissions || entry.permissions.some((p) => permissions.includes(p))) &&
  (!entry.parcours || parcours[entry.parcours]);

export const NAVIGATION: readonly NavigationEntry[] = [
  {
    label: fr.coquille.entrees.tableauDeBord,
    href: '/',
    module: null,
    icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  },
  {
    label: fr.coquille.entrees.personnes,
    href: '/personnes',
    module: 'socle',
    permissions: ['personnes:lire'],
    icon: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8',
  },
  {
    label: fr.coquille.entrees.formations,
    href: '/formations',
    module: 'referentiel',
    permissions: ['referentiel:lire', 'referentiel:gerer', 'referentiel:publier'],
    icon: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5',
  },
  {
    label: fr.coquille.entrees.promotions,
    href: '/promotions',
    module: 'referentiel',
    permissions: ['promotions:lire', 'promotions:gerer'],
    icon: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6',
  },
  {
    label: fr.coquille.entrees.entreprises,
    href: '/entreprises',
    module: 'alternance',
    permissions: ['entreprises:lire', 'entreprises:gerer'],
    icon: 'M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M8 8h4M8 12h4M8 16h4',
  },
  {
    label: fr.coquille.entrees.maFormation,
    href: '/ma-formation',
    module: 'referentiel',
    parcours: 'apprenant',
    icon: 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13',
  },
  {
    label: fr.coquille.entrees.mesEnseignements,
    href: '/mes-enseignements',
    module: 'referentiel',
    parcours: 'intervenant',
    icon: 'M4 5h16v11H4zM8 20h8M12 16v4',
  },
  {
    label: fr.coquille.entrees.seances,
    href: '/seances',
    module: 'emargement',
    permissions: ['emargement:animer'],
    icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  },
  {
    label: fr.coquille.entrees.emarger,
    href: '/emarger',
    module: 'emargement',
    icon: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11',
  },
  {
    label: fr.coquille.entrees.parametres,
    href: '/parametres',
    module: 'socle',
    permissions: PERMISSIONS_PARAMETRES,
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
  },
];
