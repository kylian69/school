import { EmailJob, QUEUES } from '@scolaly/contracts';
import { creerPartitionsAudit, type Database } from '@scolaly/db';
import type { Queue } from 'bullmq';
import { Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';
import type { Mailer } from './mailer.js';

export const MAINTENANCE_JOBS = {
  partitionsAudit: 'partitions-audit',
} as const;

/** Tâches planifiées (architecture section 6). Idempotent : à appeler à chaque démarrage. */
export async function registerSchedules(maintenance: Queue): Promise<void> {
  // Chaque jour à 02:15 UTC : partitions du journal d'audit pour les 3 mois à venir.
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.partitionsAudit,
    { pattern: '15 2 * * *', tz: 'UTC' },
    { name: MAINTENANCE_JOBS.partitionsAudit, opts: { removeOnComplete: 30, removeOnFail: 100 } },
  );
}

export function startWorkers(options: {
  connection: ConnectionOptions;
  db: Database;
  mailer: Mailer;
  logger: Logger;
  /** Préfixe des clés BullMQ (isolement des tests). */
  prefix?: string;
}): Worker[] {
  const { connection, db, mailer, logger } = options;
  const common = { connection, ...(options.prefix ? { prefix: options.prefix } : {}) };
  const maintenance = new Worker(
    QUEUES.maintenance,
    async (job) => {
      if (job.name === MAINTENANCE_JOBS.partitionsAudit) await creerPartitionsAudit(db, 3);
      else throw new Error(`Tâche de maintenance inconnue : ${job.name}`);
    },
    common,
  );
  const emails = new Worker(
    QUEUES.emails,
    async (job) => {
      await mailer.send(EmailJob.parse(job.data));
    },
    { ...common, concurrency: 5 },
  );
  for (const worker of [maintenance, emails]) {
    worker.on('failed', (job, error) => {
      logger.warn({ queue: worker.name, jobId: job?.id, err: error.message }, 'Tâche en échec');
    });
  }
  return [maintenance, emails];
}
