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
  TYPE_FICHIER_ICAL,
  TYPES_LOGO,
} from '@scolaly/contracts';
import { createDatabase } from '@scolaly/db';
import type { FastifyRequest } from 'fastify';
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

/**
 * Débuts d'adresse suivis d'un jeton secret : flux iCal (RG-04-15), invitation et activation du
 * compte (US-01-07), réinitialisation du mot de passe de Better Auth. Toute nouvelle route qui
 * porte un secret dans son chemin s'ajoute ici.
 */
export const CHEMINS_A_JETON = ['/api/agenda/', '/api/invitations/', '/api/auth/reset-password/'];

/**
 * Paramètres de requête secrets, quelle que soit la route : lien magique et vérification de
 * l'adresse email de Better Auth (`token`), et noms voisins par prudence.
 */
export const PARAMETRES_SECRETS = ['token', 'jeton', 'secret', 'code', 'otp', 'signature'];

const MASQUE = '[masqué]';

function decoder(brut: string): string {
  try {
    return decodeURIComponent(brut);
  } catch {
    return brut;
  }
}

/** Adresse telle qu'écrite dans les journaux : jetons du chemin et paramètres secrets masqués. */
export function masquerJetonsUrl(url: string): string {
  const separateur = url.indexOf('?');
  let chemin = separateur === -1 ? url : url.slice(0, separateur);
  // Comparaison sur l'adresse décodée : un caractère encodé (%61genda) ne contourne pas le masque.
  const decode = decoder(chemin);
  const prefixe = CHEMINS_A_JETON.find((debut) => decode.toLowerCase().startsWith(debut));
  if (prefixe) {
    // Le reste brut garde un « / » encodé (%2F) dans le segment masqué.
    const reste = chemin.toLowerCase().startsWith(prefixe) ? chemin : decode;
    chemin = prefixe + reste.slice(prefixe.length).replace(/^[^/]+/, MASQUE);
  }
  if (separateur === -1) return chemin;
  const requete = url
    .slice(separateur + 1)
    .split('&')
    .map((paire) => {
      const egal = paire.indexOf('=');
      const nom = egal === -1 ? paire : paire.slice(0, egal);
      const secret = PARAMETRES_SECRETS.includes(decoder(nom.replace(/\+/g, ' ')).toLowerCase());
      return secret ? `${nom}=${MASQUE}` : paire;
    })
    .join('&');
  return `${chemin}?${requete}`;
}

/** Reprend la sérialisation par défaut de Fastify, adresse masquée. */
function serialiserRequete(requete: FastifyRequest) {
  const port = requete.socket.remotePort;
  return {
    method: requete.method,
    url: masquerJetonsUrl(requete.url),
    host: requete.host,
    remoteAddress: requete.ip,
    ...(port === undefined ? {} : { remotePort: port }),
  };
}

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
      serializers: { req: serialiserRequete },
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
  // Fichiers d’import (RG-01-17, iCal RG-04-09) : même principe, limite métier de 10 Mo contrôlée
  // par le service.
  fastify.addContentTypeParser(
    [...Object.keys(TYPES_FICHIER_IMPORT), TYPE_FICHIER_ICAL],
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
