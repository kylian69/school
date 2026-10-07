import helmet from '@fastify/helmet';
import type { Provider, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ARCHIVE_PHOTOS_TAILLE_MAX,
  DOCUMENT_CONTRAT_TAILLE_MAX,
  IMPORT_TAILLE_MAX,
  LOGO_TAILLE_MAX,
  TYPES_ARCHIVE_PHOTOS,
  TYPES_FICHIER_IMPORT,
  TYPES_LOGO,
} from '@scolaly/contracts';
import { createDatabase } from '@scolaly/db';
import { PHOTO_TAILLE_MAX } from '@scolaly/domain';
import { createAuth } from './auth/auth.js';
import { registerAuthRoutes } from './auth/auth.routes.js';
import type { Env } from './config/env.js';
import { AppModule } from './app.module.js';
import { ClamdScanner, DisabledScanner } from './shared/storage/antivirus.js';
import { ObjectStorage } from './shared/storage/object-storage.js';
import { UploadService } from './shared/storage/uploads.js';
import { EmailsQueue } from './shared/emails.js';
import { createValkey } from './shared/valkey.js';

/** Champs jamais écrits dans les journaux (plan de développement, section 6). */
export const REDACTED_LOG_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.secret',
];

export interface CreateAppOptions {
  /** Flux de sortie des journaux (tests). Par défaut : sortie standard. */
  logStream?: NodeJS.WritableStream;
  /** Résolution des droits (par défaut : aucun droit tant que les rôles n'existent pas, I1.2). */
  accessResolver?: Provider;
  /** Modules supplémentaires (tests). */
  extraModules?: Type[];
  /** Préfixe des files BullMQ (isolement des tests). */
  queuePrefix?: string;
}

export async function createApp(
  env: Env,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const database = createDatabase(env.DATABASE_URL);
  const valkey = createValkey(env.VALKEY_URL);
  const storage = ObjectStorage.fromEnv(env);
  const scanner =
    env.ANTIVIRUS_DISABLED || !env.CLAMAV_HOST
      ? new DisabledScanner()
      : new ClamdScanner(env.CLAMAV_HOST, env.CLAMAV_PORT);
  const uploads = new UploadService(storage, scanner);
  const emails = new EmailsQueue(env.VALKEY_URL, options.queuePrefix);
  const auth = createAuth(env, database.db, valkey, emails);
  const platformDatabase =
    env.SCOLALY_MODE === 'saas' && env.PLATFORM_DATABASE_URL
      ? createDatabase(env.PLATFORM_DATABASE_URL, { max: 4 })
      : undefined;

  const adapter = new FastifyAdapter({
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACTED_LOG_PATHS, censor: '[masqué]' },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(
      {
        env,
        database,
        valkey,
        auth,
        storage,
        uploads,
        emails,
        ...(platformDatabase ? { platformDatabase } : {}),
      },
      {
        ...(options.accessResolver ? { accessResolver: options.accessResolver } : {}),
        ...(options.extraModules ? { extraModules: options.extraModules } : {}),
      },
    ),
    adapter,
    { logger: env.NODE_ENV === 'test' ? ['error'] : ['error', 'warn', 'log'] },
  );

  // En-têtes de sécurité : HSTS, politique de contenu stricte (l'API ne sert aucune page).
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
  });
  registerAuthRoutes(app.getHttpAdapter().getInstance(), auth, env.PUBLIC_URL);
  // Logo de l'école envoyé tel quel (US-01-14) ; la limite métier de 2 Mo est contrôlée par le
  // service, avec un message clair, sous cette limite technique.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser(
    Object.keys(TYPES_LOGO),
    { parseAs: 'buffer', bodyLimit: 4 * LOGO_TAILLE_MAX },
    (_request, body, done) => {
      done(null, body);
    },
  );
  // Photo JPEG d'une personne (RG-01-26 : 5 Mo contrôlés par le service) ; le PNG passe par le
  // lecteur du logo ci-dessus.
  fastify.addContentTypeParser(
    'image/jpeg',
    { parseAs: 'buffer', bodyLimit: 2 * PHOTO_TAILLE_MAX },
    (_request, body, done) => {
      done(null, body);
    },
  );
  // Fichiers d'import (RG-01-17) : même principe, limite métier de 10 Mo contrôlée par le service.
  fastify.addContentTypeParser(
    Object.keys(TYPES_FICHIER_IMPORT),
    { parseAs: 'buffer', bodyLimit: 2 * IMPORT_TAILLE_MAX },
    (_request, body, done) => {
      done(null, body);
    },
  );
  // Archive ZIP de photos (US-01-20 : 200 Mo contrôlés par le service).
  fastify.addContentTypeParser(
    TYPES_ARCHIVE_PHOTOS,
    { parseAs: 'buffer', bodyLimit: ARCHIVE_PHOTOS_TAILLE_MAX + 1024 * 1024 },
    (_request, body, done) => {
      done(null, body);
    },
  );
  // Contrat ou convention de stage signés (10 Mo contrôlés par le service).
  fastify.addContentTypeParser(
    'application/pdf',
    { parseAs: 'buffer', bodyLimit: 2 * DOCUMENT_CONTRAT_TAILLE_MAX },
    (_request, body, done) => {
      done(null, body);
    },
  );
  app.enableShutdownHooks();
  return app;
}
