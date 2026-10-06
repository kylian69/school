import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { QUEUES } from '@scolaly/contracts';
import {
  ajouterEvenement,
  createDatabase,
  newId,
  organisation,
  outboxEvenement,
  withOrganisation,
} from '@scolaly/db';
import { Queue, QueueEvents, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createLogger } from '../src/logger.js';
import { createSmtpMailer } from '../src/mailer.js';
import { publishOutboxBatch, startOutboxPublisher } from '../src/outbox-publisher.js';
import { MAINTENANCE_JOBS, registerSchedules, startWorkers } from '../src/workers.js';

const connection = { url: inject('valkeyUrl') };
const prefix = inject('queuePrefix');
const app = createDatabase(inject('appUrl'), { max: 4 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const queue = (name: string) => new Queue(name, { connection, prefix });
const evenements = queue(QUEUES.evenements);
const logger = createLogger('silent');
const organisationId = newId();

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: organisationId, nom: 'École fictive', nomAffichage: 'EF' });
});

afterAll(async () => {
  await evenements.obliterate({ force: true });
  await evenements.close();
  await app.close();
  await owner.close();
});

const nouvelEvenement = async (type: string) => {
  await withOrganisation(app.db, organisationId, (tx) =>
    ajouterEvenement(tx, type, { exemple: true }),
  );
  const [ligne] = await owner.db
    .select()
    .from(outboxEvenement)
    .where(eq(outboxEvenement.type, type));
  if (!ligne) throw new Error('Événement absent');
  return ligne.id;
};

describe("Publication de la boîte d'envoi dans BullMQ", () => {
  it("publie chaque événement dans la file avec l'identifiant de l'événement", async () => {
    const id = await nouvelEvenement(`test.${randomBytes(4).toString('hex')}`);
    while ((await publishOutboxBatch(app.db, evenements)) > 0);
    const job = await evenements.getJob(id);
    expect(job?.data).toMatchObject({ id, organisationId, charge: { exemple: true } });
  });

  it('une publication répétée ne crée pas de doublon dans la file', async () => {
    const type = `test.${randomBytes(4).toString('hex')}`;
    const id = await nouvelEvenement(type);
    while ((await publishOutboxBatch(app.db, evenements)) > 0);
    // Simule un arrêt brutal entre la publication et l'acquittement.
    await owner.db.execute(sql`update outbox_evenement set publie_le = null where id = ${id}`);
    while ((await publishOutboxBatch(app.db, evenements)) > 0);
    const jobs = (await evenements.getJobs(['waiting', 'delayed', 'completed'])).filter(
      (j: Job) => j.name === type,
    );
    expect(jobs).toHaveLength(1);
  });

  it('la boucle de publication traite les nouveaux événements puis s’arrête proprement', async () => {
    const publisher = startOutboxPublisher({ db: app.db, queue: evenements, logger, pollMs: 100 });
    const id = await nouvelEvenement(`test.${randomBytes(4).toString('hex')}`);
    await expect.poll(() => evenements.getJob(id), { timeout: 5000 }).toBeDefined();
    await publisher.stop();
  });
});

describe('Tâches planifiées et workers', () => {
  const maintenance = queue(QUEUES.maintenance);
  const emails = queue(QUEUES.emails);
  const mailer = createSmtpMailer(inject('smtpUrl'), 'Scolaly <ne-pas-repondre@exemple.test>');
  const valkey = new Redis(connection.url);
  const workers = startWorkers({
    valkey,
    connection,
    db: app.db,
    mailer,
    logger,
    prefix,
    publicUrl: 'http://localhost:3000',
  });

  afterAll(async () => {
    await Promise.all(workers.map((w) => w.close()));
    for (const q of [maintenance, emails]) {
      await q.obliterate({ force: true });
      await q.close();
    }
    mailer.close();
    valkey.disconnect();
  });

  const terminer = async (q: Queue, name: string, data: unknown) => {
    const events = new QueueEvents(q.name, { connection, prefix });
    await events.waitUntilReady();
    try {
      const job = await q.add(name, data);
      await job.waitUntilFinished(events, 10_000);
    } finally {
      await events.close();
    }
  };

  it('planifie la création quotidienne des partitions du journal d’audit (idempotent)', async () => {
    await registerSchedules(maintenance);
    await registerSchedules(maintenance);
    const schedulers = await maintenance.getJobSchedulers();
    expect(schedulers.map((s) => [s.key, s.pattern]).sort()).toEqual([
      [MAINTENANCE_JOBS.partitionsAudit, '15 2 * * *'],
      [MAINTENANCE_JOBS.prechargementEmargement, undefined],
      [MAINTENANCE_JOBS.purgeCorbeille, '0 3 * * *'],
      [MAINTENANCE_JOBS.relancesInvitations, '0 9 * * *'],
    ]);
  });

  it('RG-01-23 la tâche de purge de la corbeille s’exécute', async () => {
    await terminer(maintenance, MAINTENANCE_JOBS.purgeCorbeille, {});
  });

  it('la tâche de maintenance crée les partitions à venir', async () => {
    await terminer(maintenance, MAINTENANCE_JOBS.partitionsAudit, {});
    const result = await owner.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_inherits where inhparent = 'audit_evenement'::regclass`,
    );
    expect(result.rows[0]?.n).toBeGreaterThanOrEqual(4);
  });

  it('envoie un email par SMTP (Mailpit en test)', async () => {
    const subject = `Invitation ${randomBytes(4).toString('hex')}`;
    await terminer(emails, 'envoi', {
      to: 'camille@exemple.test',
      subject,
      text: 'Bienvenue sur Scolaly.',
    });
    const api = inject('mailpitApi');
    await expect
      .poll(
        async () => {
          const response = await fetch(
            `${api}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
          );
          return ((await response.json()) as { messages_count: number }).messages_count;
        },
        { timeout: 5000 },
      )
      .toBe(1);
  });

  it('refuse une tâche d’email mal formée', async () => {
    await expect(
      terminer(emails, 'envoi', { to: 'pas-un-email', subject: '', text: '' }),
    ).rejects.toThrow();
  });
});

describe('Journal du worker', () => {
  it('masque le contenu des emails et les secrets', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    createLogger('info', stream).info(
      { email: { text: 'contenu privé', password: 'secret' } },
      'test',
    );
    expect(lines.join('')).not.toMatch(/contenu privé|secret"/);
    expect(lines.join('')).toContain('[masqué]');
  });
});
