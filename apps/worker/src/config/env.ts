import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^(redis|rediss|valkey)$/ }),
  /** Serveur SMTP (Mailpit en local), par exemple smtp://utilisateur:motdepasse@hote:587. */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z.string().min(3),
  /** Adresse publique de Scolaly, pour les liens envoyés par email (relances d'invitation). */
  PUBLIC_URL: z.url(),
  /** Intervalle de lecture de la boîte d'envoi, en millisecondes. */
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(1000),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuration du worker invalide. Corriger ces variables d'environnement puis relancer :\n${details}`,
    );
  }
  return result.data;
}
