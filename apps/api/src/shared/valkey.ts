import type { SecondaryStorage } from 'better-auth';
import { Redis } from 'ioredis';

export function createValkey(url: string): Redis {
  return new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
}

/** Stockage secondaire de Better Auth (sessions en cache, compteurs de limitation de débit). */
export function valkeySecondaryStorage(valkey: Redis, prefix = 'auth:'): SecondaryStorage {
  return {
    get: (key) => valkey.get(prefix + key),
    getAndDelete: (key) => valkey.getdel(prefix + key),
    set: async (key, value, ttl) => {
      if (ttl) await valkey.set(prefix + key, value, 'EX', ttl);
      else await valkey.set(prefix + key, value);
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
