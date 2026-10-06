import { z } from 'zod';

/** Contrats de l'écran « Corbeille » (E-01-10 ; US-01-16, RG-01-23). */

export const TYPES_CORBEILLE = ['personne', 'annee', 'fermeture', 'role'] as const;
export type TypeCorbeille = (typeof TYPES_CORBEILLE)[number];

export const ElementCorbeille = z
  .object({
    type: z.enum(TYPES_CORBEILLE),
    id: z.uuid(),
    libelle: z.string(),
    supprimeLe: z.iso.datetime({ offset: true }),
    /** Auteur de la suppression, retrouvé par sa fiche ; null s'il n'est plus dans l'école. */
    supprimePar: z.string().nullable(),
    /** Date d'effacement définitif (30 jours après la suppression). */
    effacementLe: z.iso.datetime({ offset: true }),
    /** Éléments liés supprimés en même temps, restaurés avec lui (rôles, périodes, fermetures). */
    lies: z.int().min(0),
  })
  .meta({ id: 'ElementCorbeille' });
export type ElementCorbeille = z.infer<typeof ElementCorbeille>;

export const Corbeille = z
  .object({ elements: z.array(ElementCorbeille) })
  .meta({ id: 'Corbeille' });
export type Corbeille = z.infer<typeof Corbeille>;
