import { z } from 'zod';

/** Files de traitement BullMQ (architecture, section 6). */
export const QUEUES = {
  /** Événements internes publiés depuis la boîte d'envoi (notifications, indicateurs, webhooks). */
  evenements: 'evenements',
  emails: 'emails',
  /** Tâches planifiées de maintenance (partitions d'audit, purges). */
  maintenance: 'maintenance',
} as const;

export const EmailJob = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().optional(),
});
export type EmailJob = z.infer<typeof EmailJob>;

/** Événement interne tel que publié dans la file `evenements`. */
export const EvenementJob = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  type: z.string(),
  charge: z.unknown(),
  survenuLe: z.iso.datetime(),
});
export type EvenementJob = z.infer<typeof EvenementJob>;

/** RG-04-14 : type de l'événement émis à la publication ou au changement d'une séance publiée. */
export const EVENEMENT_CHANGEMENT_EDT = 'edt.changement';

/**
 * Charge de l'événement `edt.changement` : uniquement des identifiants. Les personnes concernées
 * sont celles des séances au moment du traitement, plus les intervenants retirés (`retraits`).
 */
export const ChargeChangementEdt = z.object({
  nature: z.enum(['publication', 'modification', 'annulation', 'report']),
  seanceIds: z.array(z.uuid()).min(1),
  retraits: z.array(z.object({ seanceId: z.uuid(), personneId: z.uuid() })).default([]),
});
export type ChargeChangementEdt = z.infer<typeof ChargeChangementEdt>;

/**
 * RG-06-15 : un intervenant a corrigé un appel verrouillé ; la scolarité et la pédagogie de
 * l'école en sont averties. La charge ne porte que des identifiants (ni motif ni nom).
 */
export const EVENEMENT_CORRECTION_VERROUILLEE = 'emargement.correction-verrouillee';

export const ChargeCorrectionVerrouillee = z.object({
  seanceId: z.uuid(),
  version: z.int().min(2),
});
export type ChargeCorrectionVerrouillee = z.infer<typeof ChargeCorrectionVerrouillee>;
