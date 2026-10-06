import { fileURLToPath } from 'node:url';
import type { Env } from '../config/env.js';

export const OPENAPI_FILE = fileURLToPath(new URL('../../openapi.json', import.meta.url));
export const OPENAPI_VERSION = '0.0.0';

/** Configuration factice : la génération n'ouvre aucune connexion. */
export const OPENAPI_GENERATION_ENV: Env = {
  NODE_ENV: 'test',
  // Mode SaaS : les routes de la console de la plateforme figurent dans le document.
  SCOLALY_MODE: 'saas',
  PLATFORM_DATABASE_URL: 'postgres://generation:generation@localhost:1/generation',
  PORT: 0,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://generation:generation@localhost:1/generation',
  VALKEY_URL: 'redis://localhost:1',
  PUBLIC_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'generation-openapi-sans-connexion-reelle',
  S3_REGION: 'garage',
  S3_BUCKET: 'generation',
  S3_ACCESS_KEY_ID: 'generation',
  S3_SECRET_ACCESS_KEY: 'generation',
  S3_FORCE_PATH_STYLE: true,
  CLAMAV_PORT: 3310,
  ANTIVIRUS_DISABLED: true,
};
