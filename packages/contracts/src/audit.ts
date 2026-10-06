import { z } from 'zod';

/** Contrats de l'écran « Journal d'audit » (E-01-08 ; US-01-13, RG-01-22). */

export const EvenementAudit = z
  .object({
    id: z.uuid(),
    survenuLe: z.iso.datetime({ offset: true }),
    /** Auteur retrouvé par sa fiche dans l'école ; null pour une action système. */
    auteur: z.object({ id: z.uuid(), nom: z.string() }).nullable(),
    adresseIp: z.string().nullable(),
    action: z.string(),
    objetType: z.string(),
    objetId: z.uuid().nullable(),
    avant: z.unknown(),
    apres: z.unknown(),
  })
  .meta({ id: 'EvenementAudit' });
export type EvenementAudit = z.infer<typeof EvenementAudit>;

export const JournalAudit = z
  .object({
    evenements: z.array(EvenementAudit),
    /** Curseur de la page suivante (plus anciens) ; null en fin de journal. */
    suivant: z.string().nullable(),
  })
  .meta({ id: 'JournalAudit' });
export type JournalAudit = z.infer<typeof JournalAudit>;

const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');

/** Filtres du journal : auteur (compte), action, objet, période (bornes incluses). */
export const RechercheJournal = z.object({
  auteur: z.uuid().optional(),
  action: z.string().trim().max(60).optional(),
  objet: z.uuid().optional(),
  du: jour.optional(),
  au: jour.optional(),
  curseur: z.string().max(200).optional(),
  parPage: z.coerce.number().int().min(1).max(200).default(50),
});
export type RechercheJournal = z.infer<typeof RechercheJournal>;
