import type { FastifyInstance } from 'fastify';
import { AUTH_BASE_PATH, type Auth } from './auth.js';

/**
 * Monte le gestionnaire de Better Auth (API Fetch) sur Fastify. L'URL est reconstruite à partir
 * de l'adresse publique configurée, jamais de l'en-tête Host fourni par le client.
 */
export function registerAuthRoutes(fastify: FastifyInstance, auth: Auth, publicUrl: string): void {
  fastify.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    handler: async (request, reply) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.append(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const response = await auth.handler(
        new Request(new URL(request.url, publicUrl), {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') void reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) void reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
