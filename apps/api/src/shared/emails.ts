import { QUEUES, type EmailJob } from '@scolaly/contracts';
import { Queue } from 'bullmq';

/** Envoi d'emails : tâches confiées au worker par la file BullMQ « emails » (architecture § 6). */
export class EmailsQueue {
  private queue: Queue | undefined;

  constructor(
    private readonly valkeyUrl: string,
    private readonly prefix?: string,
  ) {}

  /** Connexion à la file au premier envoi seulement (génération d'OpenAPI sans Valkey). */
  private file(): Queue {
    this.queue ??= new Queue(QUEUES.emails, {
      connection: { url: this.valkeyUrl },
      ...(this.prefix ? { prefix: this.prefix } : {}),
    });
    return this.queue;
  }

  async envoyer(email: EmailJob): Promise<void> {
    await this.file().add('envoi', email, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async close(): Promise<void> {
    await this.queue?.close();
  }
}
