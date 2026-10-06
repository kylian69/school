import { hkdfSync } from 'node:crypto';
import { CLES_EMARGEMENT, type PresenceEnCache } from '@scolaly/contracts';
import type { Redis } from 'ioredis';

/** Séance telle que préchargée dans Valkey (RG-00-17). */
export interface SeanceEnCache {
  organisationId: string;
  libelle: string;
  debut: number;
  fin: number;
  distanciel: boolean;
}

/** Les clés du cache vivent jusqu'à une heure après la fin de la séance. */
const expiration = (finMs: number) => Math.ceil(finMs / 1000) + 3600;

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

  async precharger(seanceId: string, seance: SeanceEnCache, attendus: Map<string, string>) {
    const fin = expiration(seance.fin);
    const multi = this.valkey
      .multi()
      .del(CLES_EMARGEMENT.attendus(seanceId))
      .hset(CLES_EMARGEMENT.seance(seanceId), {
        organisationId: seance.organisationId,
        libelle: seance.libelle,
        debut: String(seance.debut),
        fin: String(seance.fin),
        distanciel: seance.distanciel ? '1' : '0',
      })
      .expireat(CLES_EMARGEMENT.seance(seanceId), fin);
    if (attendus.size > 0) {
      multi
        .hset(CLES_EMARGEMENT.attendus(seanceId), Object.fromEntries(attendus))
        .expireat(CLES_EMARGEMENT.attendus(seanceId), fin);
    }
    await multi.exec();
  }

  async seance(seanceId: string): Promise<SeanceEnCache | null> {
    const valeurs = await this.valkey.hgetall(CLES_EMARGEMENT.seance(seanceId));
    if (!valeurs.organisationId) return null;
    return {
      organisationId: valeurs.organisationId,
      libelle: valeurs.libelle ?? '',
      debut: Number(valeurs.debut),
      fin: Number(valeurs.fin),
      distanciel: valeurs.distanciel === '1',
    };
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
      String(expiration(finMs)),
    )) as string | null;
    return existante ? (JSON.parse(existante) as PresenceEnCache) : null;
  }

  async presences(seanceId: string): Promise<PresenceEnCache[]> {
    const valeurs = await this.valkey.hvals(CLES_EMARGEMENT.presences(seanceId));
    return valeurs.map((v) => JSON.parse(v) as PresenceEnCache);
  }
}
