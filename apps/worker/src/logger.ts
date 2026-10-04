import { pino, type Logger } from 'pino';

/** Journal du worker, sans secret ni contenu d'email (plan de développement, section 6). */
export function createLogger(level: string, destination?: NodeJS.WritableStream): Logger {
  return pino(
    {
      level,
      base: { service: 'worker' },
      redact: {
        paths: ['*.password', '*.token', '*.text', '*.html', '*.smtpUrl'],
        censor: '[masqué]',
      },
    },
    destination,
  );
}
