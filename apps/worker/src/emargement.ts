import {
  CLES_EMARGEMENT,
  commandesPrechargement,
  commandesSessions,
  perimetreAControler,
  type PresenceEnCache,
} from '@scolaly/contracts';
import {
  enregistrerPresences,
  etablissementDeSeance,
  seanceEtAttendus,
  seancesAPrecharger,
  sessionsDesComptes,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/** Taille maximale d'un lot écrit en base (architecture, section 5 : 500 lignes). */
export const LOT_PRESENCES = 500;

type EntreesFlux = [string, string[]][];
/** Selon le client : [[flux, entrées]] (Redis classique) ou [flux, entrées] (ioredis 6). */
type ReponseLecture = [string, EntreesFlux][] | [string, EntreesFlux] | null;

/**
 * Précharge dans Valkey les séances qui commencent dans les 15 prochaines minutes (RG-00-17 :
 * au plus tard 5 minutes avant ; l'appel s'ouvre 10 minutes avant, RG-06-01), avec les sessions
 * de leurs attendus. Idempotent : la liste des attendus est rafraîchie, les présences déjà
 * enregistrées ne bougent pas.
 */
export async function prechargerSeances(db: Database, valkey: Redis, maintenant = new Date()) {
  const seances = await seancesAPrecharger(
    db,
    new Date(maintenant.getTime() - 15 * 60_000),
    new Date(maintenant.getTime() + 15 * 60_000),
  );
  for (const { organisationId, seanceId } of seances) {
    // Une séance n'est rechargée qu'une fois toutes les 5 minutes : le cache reste léger au pic.
    const premiere = await valkey.set(CLES_EMARGEMENT.prechargee(seanceId), '1', 'EX', 300, 'NX');
    if (premiere === null) continue;
    const trouve = await withOrganisation(db, organisationId, (tx) =>
      seanceEtAttendus(tx, seanceId),
    );
    // Séance annulée ou reportée entre-temps : elle ne s'émarge plus (US-04-11).
    if (trouve?.seance.statut !== 'publiee') continue;
    // RG-06-10 : périmètre de localisation préchargé avec la séance (aucune requête au scan).
    const localisation = perimetreAControler(
      trouve.seance.distanciel,
      await withOrganisation(db, organisationId, (tx) => etablissementDeSeance(tx, trouve.seance)),
    );
    const attendus = new Map(
      trouve.attendus.flatMap((a) => (a.userId ? [[a.userId, a.personneId] as const] : [])),
    );
    await valkey
      .pipeline(
        commandesPrechargement(
          seanceId,
          {
            organisationId,
            libelle: trouve.seance.libelle,
            debut: trouve.seance.debut.getTime(),
            fin: trouve.seance.fin.getTime(),
            distanciel: trouve.seance.distanciel,
            localisation,
          },
          attendus,
        ),
      )
      .exec();
    // Sessions des attendus remises en cache (après un redémarrage de Valkey, par exemple).
    const sessions = await sessionsDesComptes(db, [...attendus.keys()]);
    if (sessions.length > 0) await valkey.pipeline(commandesSessions(sessions)).exec();
  }
  return seances.length;
}

/**
 * Lit le flux des présences et les écrit en base par lots (RG-00-18), hors du chemin du scan. Les
 * entrées ne sont acquittées qu'une fois écrites : après une panne, les entrées en attente sont
 * relues d'abord, et l'écriture ignore les doublons.
 */
export function startPersistancePresences(options: {
  valkey: Redis;
  db: Database;
  logger: Logger;
  /** Attente maximale d'un lot, en millisecondes (architecture : 1 à 2 secondes). */
  attenteMs?: number;
  consommateur?: string;
}) {
  const { valkey, db, logger } = options;
  const attenteMs = options.attenteMs ?? 1000;
  const consommateur = options.consommateur ?? `worker-${process.pid}`;
  const etat = { actif: true };

  async function creerGroupe() {
    try {
      await valkey.xgroup(
        'CREATE',
        CLES_EMARGEMENT.flux,
        CLES_EMARGEMENT.groupeFlux,
        '0',
        'MKSTREAM',
      );
    } catch (erreur) {
      if (!String(erreur).includes('BUSYGROUP')) throw erreur;
    }
  }

  async function lire(depuis: '0' | '>'): Promise<EntreesFlux> {
    const reponse = (await valkey.call(
      'XREADGROUP',
      'GROUP',
      CLES_EMARGEMENT.groupeFlux,
      consommateur,
      'COUNT',
      LOT_PRESENCES,
      ...(depuis === '>' ? ['BLOCK', attenteMs] : []),
      'STREAMS',
      CLES_EMARGEMENT.flux,
      depuis,
    )) as ReponseLecture;
    if (!reponse) return [];
    const [premier] = reponse;
    if (Array.isArray(premier)) return premier[1];
    return (reponse as [string, EntreesFlux])[1];
  }

  const presenceDe = ([, champs]: [string, string[]]) => {
    const valeur = champs[champs.indexOf('presence') + 1];
    return valeur ? [JSON.parse(valeur) as PresenceEnCache] : [];
  };

  /** Violation d'intégrité (séance ou fiche disparue) : l'entrée ne pourra jamais être écrite. */
  const definitive = (erreur: unknown) => {
    const code = (erreur as { cause?: { code?: unknown } }).cause?.code;
    return typeof code === 'string' && code.startsWith('23');
  };

  async function ecrire(entrees: EntreesFlux): Promise<number> {
    try {
      return await enregistrerPresences(db, entrees.flatMap(presenceDe));
    } catch (erreur) {
      if (entrees.length === 1) {
        if (!definitive(erreur)) throw erreur;
        logger.error(
          { err: erreur, entree: entrees[0]?.[0] },
          'Présence impossible à écrire, écartée',
        );
        return 0;
      }
      // Lot en échec : entrée par entrée, pour qu'une seule entrée invalide ne bloque pas le flux.
      let ajoutees = 0;
      for (const entree of entrees) ajoutees += await ecrire([entree]);
      return ajoutees;
    }
  }

  async function traiter(entrees: EntreesFlux) {
    const ajoutees = await ecrire(entrees);
    const ids = entrees.map(([id]) => id);
    await valkey
      .multi()
      .xack(CLES_EMARGEMENT.flux, CLES_EMARGEMENT.groupeFlux, ...ids)
      .xdel(CLES_EMARGEMENT.flux, ...ids)
      .exec();
    logger.debug({ lues: entrees.length, ajoutees }, 'Présences écrites');
  }

  const boucle = (async () => {
    await creerGroupe();
    while (etat.actif) {
      try {
        // Entrées déjà distribuées mais pas acquittées (panne précédente), puis nouvelles.
        const enAttente = await lire('0');
        const entrees = enAttente.length > 0 ? enAttente : await lire('>');
        if (entrees.length > 0) await traiter(entrees);
      } catch (erreur) {
        logger.error({ err: erreur }, 'Écriture des présences en échec, nouvel essai');
        await new Promise((resoudre) => setTimeout(resoudre, attenteMs));
      }
    }
  })();

  return {
    async stop() {
      etat.actif = false;
      await boucle;
    },
  };
}
