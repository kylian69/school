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

/** Valkey ne répond pas : l'émargement bascule en mode dégradé. */
export class CacheIndisponible extends Error {
  override name = 'CacheIndisponible';
}

/** Où le scan lit la séance et l'attendu, et écrit la présence (cache, ou base en mode dégradé). */
export interface Magasin {
  seance(seanceId: string): Promise<SeanceEnCache | null>;
  attendu(seanceId: string, userId: string): Promise<string | null>;
  enregistrer(
    presence: PresenceEnCache,
    finMs: number,
  ): Promise<Pick<PresenceEnCache, 'scanneLe' | 'rejoue' | 'localisation'> | null>;
}

/** Toute erreur de Valkey devient CacheIndisponible. */
async function surValkey<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (erreur) {
    throw new CacheIndisponible('Valkey indisponible', { cause: erreur });
  }
}

export class CacheEmargement implements Magasin {
  constructor(private readonly valkey: Redis) {}

  /**
   * Connexion coupée : inutile d'attendre les nouvelles tentatives du client. Une connexion pas
   * encore ouverte (connexion paresseuse, au démarrage) n'est pas une panne : elle s'ouvre à la
   * première commande.
   */
  disponible() {
    return !['reconnecting', 'close', 'end'].includes(this.valkey.status);
  }

  async precharger(seanceId: string, seance: SeanceEnCache, attendus: ReadonlyMap<string, string>) {
    await surValkey(() =>
      this.valkey.pipeline(commandesPrechargement(seanceId, seance, attendus)).exec(),
    );
  }

  /** Remet en cache des sessions lues en base (format de Better Auth). */
  async rechaufferSessions(commandes: string[][]) {
    if (commandes.length > 0) await surValkey(() => this.valkey.pipeline(commandes).exec());
  }

  async seance(seanceId: string): Promise<SeanceEnCache | null> {
    return lireSeanceEnCache(
      await surValkey(() => this.valkey.hgetall(CLES_EMARGEMENT.seance(seanceId))),
    );
  }

  attendu(seanceId: string, userId: string): Promise<string | null> {
    return surValkey(() => this.valkey.hget(CLES_EMARGEMENT.attendus(seanceId), userId));
  }

  /** Renvoie la présence déjà enregistrée si l'apprenant avait émargé, sinon rien. */
  async enregistrer(presence: PresenceEnCache, finMs: number): Promise<PresenceEnCache | null> {
    const existante = (await surValkey(() =>
      this.valkey.eval(
        ENREGISTRER,
        2,
        CLES_EMARGEMENT.presences(presence.seanceId),
        CLES_EMARGEMENT.flux,
        presence.personneId,
        JSON.stringify(presence),
        String(expirationCache(finMs)),
      ),
    )) as string | null;
    return existante ? (JSON.parse(existante) as PresenceEnCache) : null;
  }

  async presences(seanceId: string): Promise<PresenceEnCache[]> {
    const valeurs = await surValkey(() => this.valkey.hvals(CLES_EMARGEMENT.presences(seanceId)));
    return valeurs.map((v) => JSON.parse(v) as PresenceEnCache);
  }
}
