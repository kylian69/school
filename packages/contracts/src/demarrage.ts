import { z } from 'zod';

/** Contrats de la liste de démarrage (E-01-01 ; US-01-01). */

export const ETAPES_DEMARRAGE = ['organisation', 'calendrier', 'apparence', 'roles'] as const;
export type EtapeDemarrage = (typeof ETAPES_DEMARRAGE)[number];

export const Demarrage = z
  .object({
    etapes: z.array(
      z.object({
        code: z.enum(ETAPES_DEMARRAGE),
        statut: z.enum(['faite', 'sautee', 'a-faire']),
        /** Faite d'après les données de l'école, sans choix de l'administrateur. */
        automatique: z.boolean(),
      }),
    ),
    avancement: z.int().min(0).max(100),
    termine: z.boolean(),
    /** Constats qui résument chaque étape. */
    constats: z.object({
      etablissementsComplets: z.int(),
      annees: z.int(),
      fermetures: z.int(),
      couleur: z.boolean(),
      logo: z.boolean(),
      roles: z.int(),
      personnesAvecRole: z.int(),
    }),
  })
  .meta({ id: 'Demarrage' });
export type Demarrage = z.infer<typeof Demarrage>;

/** Marquer une étape faite ou passée ; null : la reprendre (elle suit de nouveau les données). */
export const ChoixEtapeDemarrage = z
  .object({ choix: z.enum(['faite', 'sautee']).nullable() })
  .meta({ id: 'ChoixEtapeDemarrage' });
export type ChoixEtapeDemarrage = z.infer<typeof ChoixEtapeDemarrage>;
