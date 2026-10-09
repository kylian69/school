import { EmailJob, EVENEMENT_CHANGEMENT_EDT, EvenementJob, QUEUES } from '@scolaly/contracts';
import {
  creerPartitionsAudit,
  purgerCorbeille,
  rechiffrerValeurs,
  type Database,
  type FieldEncryption,
} from '@scolaly/db';
import { DELAI_CORBEILLE_JOURS } from '@scolaly/domain';
import type { Queue } from 'bullmq';
import { Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { purgerIndisponibilitesPassees } from './conservation.js';
import { prechargerSeances } from './emargement.js';
import type { Mailer } from './mailer.js';
import { enregistrerChangementEdt, envoyerNotificationsEdt } from './notifications-edt.js';
import { relancerInvitations } from './relances.js';

export const MAINTENANCE_JOBS = {
  partitionsAudit: 'partitions-audit',
  relancesInvitations: 'relances-invitations',
  purgeCorbeille: 'purge-corbeille',
  prechargementEmargement: 'prechargement-emargement',
  notificationsEdt: 'notifications-edt',
  recapitulatifEdt: 'recapitulatif-edt',
  conservationIndisponibilites: 'conservation-indisponibilites',
  rechiffrement: 'rechiffrement',
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
  // Chaque jour à 3 h 30 (Paris) : motifs des indisponibilités terminées effacés, indisponibilités
  // anciennes supprimées (RG-04-18 ; durées dans packages/referentials).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.conservationIndisponibilites,
    { pattern: '30 3 * * *', tz: 'Europe/Paris' },
    {
      name: MAINTENANCE_JOBS.conservationIndisponibilites,
      opts: { removeOnComplete: 30, removeOnFail: 100 },
    },
  );
  // Chaque heure à 45 : valeurs chiffrées avec une ancienne clé maîtresse rechiffrées avec la
  // version courante, par lots et transactions courtes (ADR 0006 ; rien à faire hors rotation).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.rechiffrement,
    { pattern: '45 * * * *', tz: 'UTC' },
    { name: MAINTENANCE_JOBS.rechiffrement, opts: { removeOnComplete: 30, removeOnFail: 100 } },
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
  // Chaque minute : changements d'EDT des 48 prochaines heures, rafales regroupées (RG-04-14).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.notificationsEdt,
    { every: 60_000 },
    { name: MAINTENANCE_JOBS.notificationsEdt, opts: { removeOnComplete: 10, removeOnFail: 100 } },
  );
  // Chaque quart d'heure : récapitulatif des autres changements d'EDT, envoyé à 18 h dans le
  // fuseau de l'établissement des séances (RG-04-14 ; tous les fuseaux sont au quart d'heure).
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOBS.recapitulatifEdt,
    { pattern: '*/15 * * * *' },
    { name: MAINTENANCE_JOBS.recapitulatifEdt, opts: { removeOnComplete: 30, removeOnFail: 100 } },
  );
}

export function startWorkers(options: {
  connection: ConnectionOptions;
  db: Database;
  /** Cache de l'émargement (préchargement des séances). */
  valkey: Redis;
  mailer: Mailer;
  /** File des emails, où partent les notifications (nouvelles tentatives, clé d'idempotence). */
  emails: Queue;
  logger: Logger;
  /** Préfixe des clés BullMQ (isolement des tests). */
  prefix?: string;
  /** Adresse publique, pour les liens des relances. */
  publicUrl: string;
  /** Chiffrement par champ, pour rechiffrer après une rotation de la clé maîtresse. */
  chiffrement: FieldEncryption;
}): Worker[] {
  const { connection, db, mailer, logger } = options;
  const common = { connection, ...(options.prefix ? { prefix: options.prefix } : {}) };
  const confier = async (email: EmailJob, cle: string) => {
    await options.emails.add('envoi', email, {
      jobId: cle,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  };
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
      } else if (job.name === MAINTENANCE_JOBS.conservationIndisponibilites) {
        const bilan = await purgerIndisponibilitesPassees(db);
        logger.info({ bilan }, 'Indisponibilités passées purgées');
      } else if (job.name === MAINTENANCE_JOBS.rechiffrement) {
        // Comptes seulement : ni valeur ni clé dans les journaux.
        const bilan = await rechiffrerValeurs(db, options.chiffrement);
        if (bilan.echecs > 0)
          logger.warn({ bilan }, 'Valeurs chiffrées illisibles laissées en place');
        else if (bilan.rechiffrees > 0) logger.info({ bilan }, 'Valeurs rechiffrées');
      } else if (job.name === MAINTENANCE_JOBS.prechargementEmargement) {
        await prechargerSeances(db, options.valkey);
      } else if (job.name === MAINTENANCE_JOBS.notificationsEdt) {
        await envoyerNotificationsEdt(db, confier, options.publicUrl, 'immediat');
      } else if (job.name === MAINTENANCE_JOBS.recapitulatifEdt) {
        await envoyerNotificationsEdt(db, confier, options.publicUrl, 'recapitulatif');
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
  // Événements internes : seuls ceux qui ont un traitement sont consommés, les autres ignorés.
  const evenements = new Worker(
    QUEUES.evenements,
    async (job) => {
      const evenement = EvenementJob.parse(job.data);
      if (evenement.type === EVENEMENT_CHANGEMENT_EDT)
        await enregistrerChangementEdt(db, evenement);
    },
    { ...common, concurrency: 5 },
  );
  for (const worker of [maintenance, emails, evenements]) {
    worker.on('failed', (job, error) => {
      logger.warn({ queue: worker.name, jobId: job?.id, err: error.message }, 'Tâche en échec');
    });
  }
  return [maintenance, emails, evenements];
}
