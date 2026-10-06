import { QUEUES } from '@scolaly/contracts';
import { createDatabase } from '@scolaly/db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './config/env.js';
import { createLogger } from './logger.js';
import { createSmtpMailer } from './mailer.js';
import { startPersistancePresences } from './emargement.js';
import { startOutboxPublisher } from './outbox-publisher.js';
import { registerSchedules, startWorkers } from './workers.js';

const env = loadWorkerEnv();
const logger = createLogger(env.LOG_LEVEL);
const connection = { url: env.VALKEY_URL };
const database = createDatabase(env.DATABASE_URL);
const mailer = createSmtpMailer(env.SMTP_URL, env.MAIL_FROM);
const maintenance = new Queue(QUEUES.maintenance, { connection });
const evenements = new Queue(QUEUES.evenements, { connection });
const valkey = new Redis(env.VALKEY_URL, { maxRetriesPerRequest: null });

await registerSchedules(maintenance);
const workers = startWorkers({
  connection,
  db: database.db,
  valkey,
  mailer,
  logger,
  publicUrl: env.PUBLIC_URL,
});
const publisher = startOutboxPublisher({
  db: database.db,
  queue: evenements,
  logger,
  pollMs: env.OUTBOX_POLL_MS,
});
const persistance = startPersistancePresences({ valkey, db: database.db, logger });
logger.info('Worker démarré');

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Arrêt du worker');
  await publisher.stop();
  await persistance.stop();
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([maintenance.close(), evenements.close()]);
  mailer.close();
  valkey.disconnect();
  await database.close();
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
