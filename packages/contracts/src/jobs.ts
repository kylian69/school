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
