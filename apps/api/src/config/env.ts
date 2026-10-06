import { z } from 'zod';

/** Configuration de l'API, lue dans l'environnement et validée au démarrage. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Connexion avec le rôle scolaly_app (via PgBouncer en production). */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^(redis|rediss|valkey)$/ }),
  /** Adresse publique de l'API, utilisée par Better Auth pour ses liens et ses contrôles d'origine. */
  PUBLIC_URL: z.url(),
  /** Origine de l'interface web, seule autorisée à appeler l'authentification. */
  WEB_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'au moins 32 caractères'),
});

export type Env = z.infer<typeof EnvSchema>;

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new ConfigurationError(
      `Configuration de l'API invalide. Corriger ces variables d'environnement puis relancer :\n${details}`,
    );
  }
  return result.data;
}
