import type { SecondaryStorage } from 'better-auth';
import { Redis } from 'ioredis';

export function createValkey(url: string): Redis {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
}

/**
 * Stockage secondaire de Better Auth (sessions en cache, compteurs de limitation de débit).
 * Si Valkey ne répond pas, la lecture et l'écriture d'une session se rabattent sur la base (mode
 * dégradé de l'émargement) ; la suppression et les compteurs restent stricts : une révocation ou
 * une limitation ne sont jamais ignorées en silence.
 */
export function valkeySecondaryStorage(valkey: Redis, prefix = 'auth:'): SecondaryStorage {
  // Connexion coupée : on n'attend pas les nouvelles tentatives du client, on lit la base.
  const coupe = () => ['reconnecting', 'close', 'end'].includes(valkey.status);
  return {
    get: async (key) => {
      if (coupe()) return null;
      try {
        return await valkey.get(prefix + key);
      } catch {
        return null;
      }
    },
    getAndDelete: (key) => valkey.getdel(prefix + key),
    set: async (key, value, ttl) => {
      if (coupe()) return;
      try {
        if (ttl) await valkey.set(prefix + key, value, 'EX', ttl);
        else await valkey.set(prefix + key, value);
      } catch {
        // Session gardée en base seulement : relue de là tant que Valkey ne répond pas.
      }
    },
    delete: async (key) => {
      await valkey.del(prefix + key);
    },
    increment: async (key, ttl) => {
      const results = await valkey
        .multi()
        .incr(prefix + key)
        .expire(prefix + key, ttl, 'NX')
        .exec();
      return Number(results?.[0]?.[1] ?? 0);
    },
  };
}
