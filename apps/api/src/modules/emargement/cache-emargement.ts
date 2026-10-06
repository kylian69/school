import { hkdfSync } from 'node:crypto';
import {
  CLES_EMARGEMENT,
  commandesPrechargement,
  expirationCache,
  lireSeanceEnCache,
  type PresenceEnCache,
  type SeanceEnCache,
} from '@scolaly/contracts';
import type { Redis } from 'ioredis';

/**
 * Écriture unique de la présence et ajout au flux, en une seule opération atomique : une présence
 * écrite est toujours transmise au worker. Renvoie la présence déjà enregistrée, ou rien.
 */
const ENREGISTRER = `
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then
  return redis.call('HGET', KEYS[1], ARGV[1])
end
redis.call('EXPIREAT', KEYS[1], ARGV[3])
redis.call('XADD', KEYS[2], '*', 'presence', ARGV[2])
return false
`;

/** Clé de la séance (RG-00-16), dérivée de la clé maîtresse : jamais stockée, ni en base ni en cache. */
export function cleDeSeance(cleMaitresse: Buffer, organisationId: string, seanceId: string) {
  return new Uint8Array(
    hkdfSync('sha256', cleMaitresse, 'scolaly/emargement/v1', `${organisationId}|${seanceId}`, 32),
  );
}

export class CacheEmargement {
  constructor(private readonly valkey: Redis) {}

  async precharger(seanceId: string, seance: SeanceEnCache, attendus: ReadonlyMap<string, string>) {
    await this.valkey.multi(commandesPrechargement(seanceId, seance, attendus)).exec();
  }

  async seance(seanceId: string): Promise<SeanceEnCache | null> {
    return lireSeanceEnCache(await this.valkey.hgetall(CLES_EMARGEMENT.seance(seanceId)));
  }

  attendu(seanceId: string, userId: string): Promise<string | null> {
    return this.valkey.hget(CLES_EMARGEMENT.attendus(seanceId), userId);
  }

  /** Renvoie la présence déjà enregistrée si l'apprenant avait émargé, sinon rien. */
  async enregistrer(presence: PresenceEnCache, finMs: number): Promise<PresenceEnCache | null> {
    const existante = (await this.valkey.eval(
      ENREGISTRER,
      2,
      CLES_EMARGEMENT.presences(presence.seanceId),
      CLES_EMARGEMENT.flux,
      presence.personneId,
      JSON.stringify(presence),
      String(expirationCache(finMs)),
    )) as string | null;
    return existante ? (JSON.parse(existante) as PresenceEnCache) : null;
  }

  async presences(seanceId: string): Promise<PresenceEnCache[]> {
    const valeurs = await this.valkey.hvals(CLES_EMARGEMENT.presences(seanceId));
    return valeurs.map((v) => JSON.parse(v) as PresenceEnCache);
  }
}
