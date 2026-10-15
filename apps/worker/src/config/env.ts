import { lireClesDeChiffrement, type FieldEncryptionKeys } from '@scolaly/db';
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
  /**
   * Stockage des fichiers, pour effacer les documents échus (justificatifs, RG-06-20). Sans lui,
   * l'effacement attend : rien n'est effacé à moitié.
   */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('garage'),
  S3_BUCKET: z.string().min(3).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
});

export type WorkerEnv = z.infer<typeof EnvSchema> & {
  /** Clés maîtresses et version courante : rechiffrement après une rotation (ADR 0006). */
  chiffrement: FieldEncryptionKeys;
};

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = EnvSchema.safeParse(source);
  const cles = lireClesDeChiffrement(source);
  if (!result.success || !cles.ok) {
    const details = [
      ...(result.success ? [] : result.error.issues).map(
        (issue) => `- ${issue.path.join('.')} : ${issue.message}`,
      ),
      ...(cles.ok ? [] : cles.erreurs).map((erreur) => `- ${erreur}`),
    ].join('\n');
    throw new Error(
      `Configuration du worker invalide. Corriger ces variables d'environnement puis relancer :\n${details}`,
    );
  }
  return { ...result.data, chiffrement: cles.keys };
}
