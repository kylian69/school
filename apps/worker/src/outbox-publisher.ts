import type { EvenementJob } from '@scolaly/contracts';
import { publierEvenements, type Database } from '@scolaly/db';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';

/**
 * Publie la boîte d'envoi dans la file `evenements`. L'identifiant de la tâche est celui de
 * l'événement : une publication répétée (après un arrêt brutal) ne crée pas de doublon.
 */
export async function publishOutboxBatch(
  db: Database,
  queue: Queue,
  batchSize = 100,
): Promise<number> {
  return publierEvenements(db, batchSize, async (evenements) => {
    await queue.addBulk(
      evenements.map((e) => ({
        name: e.type,
        data: {
          id: e.id,
          organisationId: e.organisationId,
          type: e.type,
          charge: e.charge,
          survenuLe: e.survenuLe.toISOString(),
        } satisfies EvenementJob,
        opts: { jobId: e.id, removeOnComplete: 1000, removeOnFail: 5000 },
      })),
    );
  });
}

/** Boucle de publication : vide la boîte d'envoi, puis attend `pollMs` avant de relire. */
export function startOutboxPublisher(options: {
  db: Database;
  queue: Queue;
  logger: Logger;
  pollMs: number;
}): { stop: () => Promise<void> } {
  const state = { running: true };
  // Lu par une fonction : la valeur change pendant les attentes, TypeScript ne doit pas la figer.
  const isRunning = () => state.running;
  let wake: (() => void) | undefined;
  const loop = (async () => {
    while (isRunning()) {
      try {
        while (isRunning() && (await publishOutboxBatch(options.db, options.queue)) > 0);
      } catch (error) {
        options.logger.error({ err: error }, 'Publication de la boîte d’envoi impossible');
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, options.pollMs);
      });
    }
  })();
  return {
    stop: async () => {
      state.running = false;
      wake?.();
      await loop;
    },
  };
}
