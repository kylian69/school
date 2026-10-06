import { EmailJob, QUEUES } from '@scolaly/contracts';
import { creerPartitionsAudit, purgerCorbeille, type Database } from '@scolaly/db';
import { DELAI_CORBEILLE_JOURS } from '@scolaly/domain';
import type { Queue } from 'bullmq';
import { Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { prechargerSeances } from './emargement.js';
import type { Mailer } from './mailer.js';
import { relancerInvitations } from './relances.js';

export const MAINTENANCE_JOBS = {
  partitionsAudit: 'partitions-audit',
  relancesInvitations: 'relances-invitations',
  purgeCorbeille: 'purge-corbeille',
  prechargementEmargement: 'prechargement-emargement',
} as const;

/** Tâches planifiées (architecture section 6). Idempotent : à appeler à chaque démarrage. */
export async function registerSchedules(maintenance: Queue): Promise<void> {
  // Chaque jour à 02:15 UTC : partitions du journal d'audit pour les 3 mois à venir.
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.partitionsAudit,
    { pattern: '15 2 * * *', tz: 'UTC' },
    { name: MAINTENANCE_JOBS.partitionsAudit, opts: { removeOnComplete: 30, removeOnFail: 100 } },
  );
  // Chaque jour à 9 h (Paris) : relances des invitations non activées (RG-01-08).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.relancesInvitations,
    { pattern: '0 9 * * *', tz: 'Europe/Paris' },
    {
      name: MAINTENANCE_JOBS.relancesInvitations,
      opts: { removeOnComplete: 30, removeOnFail: 100 },
    },
  );
  // Chaque jour à 3 h (Paris) : effacement des éléments restés 30 jours dans la corbeille (RG-01-23).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.purgeCorbeille,
    { pattern: '0 3 * * *', tz: 'Europe/Paris' },
    { name: MAINTENANCE_JOBS.purgeCorbeille, opts: { removeOnComplete: 30, removeOnFail: 100 } },
  );
  // Chaque minute : séances des 15 prochaines minutes chargées dans Valkey (RG-00-17).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.prechargementEmargement,
    { every: 60_000 },
    {
      name: MAINTENANCE_JOBS.prechargementEmargement,
      opts: { removeOnComplete: 10, removeOnFail: 100 },
    },
  );
}

export function startWorkers(options: {
  connection: ConnectionOptions;
  db: Database;
  /** Cache de l'émargement (préchargement des séances). */
  valkey: Redis;
  mailer: Mailer;
  logger: Logger;
  /** Préfixe des clés BullMQ (isolement des tests). */
  prefix?: string;
  /** Adresse publique, pour les liens des relances. */
  publicUrl: string;
}): Worker[] {
  const { connection, db, mailer, logger } = options;
  const common = { connection, ...(options.prefix ? { prefix: options.prefix } : {}) };
  const maintenance = new Worker(
    QUEUES.maintenance,
    async (job) => {
      if (job.name === MAINTENANCE_JOBS.partitionsAudit) await creerPartitionsAudit(db, 3);
      else if (job.name === MAINTENANCE_JOBS.relancesInvitations) {
        await relancerInvitations(db, (email) => mailer.send(email), options.publicUrl);
      } else if (job.name === MAINTENANCE_JOBS.purgeCorbeille) {
        const bilan = await purgerCorbeille(
          db,
          new Date(Date.now() - DELAI_CORBEILLE_JOURS * 86_400_000),
        );
        logger.info({ bilan }, 'Corbeille purgée');
      } else if (job.name === MAINTENANCE_JOBS.prechargementEmargement) {
        await prechargerSeances(db, options.valkey);
      } else throw new Error(`Tâche de maintenance inconnue : ${job.name}`);
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
