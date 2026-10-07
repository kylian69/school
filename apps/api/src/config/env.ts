import { z } from 'zod';

/** Configuration de l'API, lue dans l'environnement et validée au démarrage. */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** SaaS multi-écoles (console de la plateforme montée) ou auto-hébergement (architecture § 1). */
    SCOLALY_MODE: z.enum(['saas', 'auto_heberge']).default('auto_heberge'),
    /** Rôle de la console de la plateforme (ADR 0004), connexion directe ; obligatoire en SaaS. */
    PLATFORM_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
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
    /** Clé maîtresse (base64, 32 octets) : chiffrement par champ et clés des QR d'émargement. */
    ENCRYPTION_MASTER_KEY_V1: z
      .base64('attendue en base64')
      .refine((v) => Buffer.from(v, 'base64').length === 32, '32 octets attendus'),
    /** Stockage compatible S3 (Garage en auto-hébergement, ADR 0003 ; passerelle S3 de Ceph en SaaS). */
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('garage'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.stringbool().default(true),
    /** Antivirus des fichiers déposés (clamd). */
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
    /**
     * Désactive l'analyse antivirus (petites installations, décision attendue à J2). À n'utiliser
     * qu'en connaissance de cause : les fichiers déposés ne sont alors pas analysés.
     */
    ANTIVIRUS_DISABLED: z.stringbool().default(false),
    /**
     * Annuaire public des entreprises (module 03, RG-03-01) : pré-remplissage par SIRET, mis en
     * cache 30 jours. Désactivable en auto-hébergement (saisie manuelle).
     */
    ANNUAIRE_ENTREPRISES_URL: z.url().default('https://recherche-entreprises.api.gouv.fr'),
    ANNUAIRE_ENTREPRISES_DISABLED: z.stringbool().default(false),
  })
  .refine((env) => env.ANTIVIRUS_DISABLED || env.CLAMAV_HOST, {
    path: ['CLAMAV_HOST'],
    message: 'obligatoire, sauf si ANTIVIRUS_DISABLED=true',
  })
  .refine((env) => env.SCOLALY_MODE !== 'saas' || env.PLATFORM_DATABASE_URL, {
    path: ['PLATFORM_DATABASE_URL'],
    message: 'obligatoire en mode SaaS (console de la plateforme)',
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
