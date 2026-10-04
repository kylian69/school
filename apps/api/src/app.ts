import helmet from '@fastify/helmet';
import type { Provider, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase } from '@scolaly/db';
import { createAuth } from './auth/auth.js';
import { registerAuthRoutes } from './auth/auth.routes.js';
import type { Env } from './config/env.js';
import { AppModule } from './app.module.js';
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
}

export async function createApp(
  env: Env,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const database = createDatabase(env.DATABASE_URL);
  const valkey = createValkey(env.VALKEY_URL);
  const auth = createAuth(env, database.db, valkey);

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
      { env, database, valkey, auth },
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
  app.enableShutdownHooks();
  return app;
}
