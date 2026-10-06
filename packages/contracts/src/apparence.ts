import { z } from 'zod';

/** Contrats de l'écran « Apparence » (E-01-09 ; US-01-14, RG-01-24). */

const couleur = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur attendue au format #RRGGBB.');

/** Formats de logo acceptés, par type de contenu envoyé (RG-01-24). */
export const TYPES_LOGO = { 'image/png': 'png', 'image/svg+xml': 'svg' } as const;
export type TypeLogo = (typeof TYPES_LOGO)[keyof typeof TYPES_LOGO];
/** Taille maximale d'un logo (RG-01-24). */
export const LOGO_TAILLE_MAX = 2 * 1024 * 1024;

/** Couleurs de l'interface dérivées de la couleur principale, lisibles dans les deux thèmes. */
export const Palette = z
  .object({
    clair: z.object({ accent: couleur, accentSoft: couleur }),
    sombre: z.object({ accent: couleur, accentSoft: couleur }),
  })
  .meta({ id: 'Palette' });
export type Palette = z.infer<typeof Palette>;

export const ApparenceEcole = z
  .object({
    nomAffichage: z.string(),
    /** Couleur principale choisie ; null : couleur de Scolaly. */
    couleur: couleur.nullable(),
    palette: Palette.nullable(),
    /** Adresse publique du logo, versionnée par son empreinte ; null sans logo. */
    logoUrl: z.string().nullable(),
  })
  .meta({ id: 'ApparenceEcole' });
export type ApparenceEcole = z.infer<typeof ApparenceEcole>;

export const ModificationApparence = z
  .object({
    nomAffichage: z.string().trim().min(1, 'Ce champ est obligatoire.').max(40).optional(),
    /** null : revenir à la couleur de Scolaly. */
    couleur: z.string().trim().nullable().optional(),
  })
  .meta({ id: 'ModificationApparence' });
export type ModificationApparence = z.infer<typeof ModificationApparence>;
