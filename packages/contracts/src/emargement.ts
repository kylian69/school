import { z } from 'zod';

/**
 * Émargement (module 06) : formats échangés et clés du cache Valkey partagées par l'API (scan,
 * ouverture de l'appel) et le worker (préchargement, écriture par lots).
 */

/** Scan du QR par l'apprenant (RG-06-06). `horsLigne` : scan conservé puis renvoyé (RG-00-19). */
export const ScanEmargement = z
  .object({ jeton: z.string().max(200), horsLigne: z.boolean().optional() })
  .meta({ id: 'ScanEmargement' });
export type ScanEmargement = z.infer<typeof ScanEmargement>;

/** Code à 6 chiffres saisi à la main (RG-06-05, RG-06-08). */
export const CodeEmargement = z
  .object({ seanceId: z.uuid(), code: z.string().regex(/^\d{6}$/, 'Saisissez les 6 chiffres.') })
  .meta({ id: 'CodeEmargement' });
export type CodeEmargement = z.infer<typeof CodeEmargement>;

export const ResultatScan = z
  .object({
    statut: z.enum(['present', 'retard', 'deja-emarge']),
    seance: z.string(),
    scanneLe: z.iso.datetime(),
    retardMinutes: z.int().min(0),
    /** RG-00-19 : accepté dans la fenêtre de grâce, à vérifier par l'intervenant. */
    rejoue: z.boolean(),
  })
  .meta({ id: 'ResultatScan' });
export type ResultatScan = z.infer<typeof ResultatScan>;

/** Ouverture de l'appel par l'intervenant : de quoi calculer le QR sur place (RG-00-16). */
export const OuvertureAppel = z
  .object({
    seanceId: z.uuid(),
    libelle: z.string(),
    debut: z.iso.datetime(),
    fin: z.iso.datetime(),
    /** Clé de la séance (base64url) : le QR est calculé sur l'écran, sans appel au serveur. */
    cle: z.string(),
    periodeSecondes: z.int().positive(),
    /** Heure du serveur, pour corriger l'horloge de l'écran. */
    maintenant: z.iso.datetime(),
  })
  .meta({ id: 'OuvertureAppel' });
export type OuvertureAppel = z.infer<typeof OuvertureAppel>;

/** Liste d'appel en direct (RG-06-03, RG-06-05 : compteur présents / attendus). */
export const AppelEnDirect = z
  .object({
    presents: z.int().min(0),
    attendus: z.int().min(0),
    liste: z.array(
      z.object({
        personneId: z.uuid(),
        nom: z.string(),
        prenom: z.string(),
        scanneLe: z.iso.datetime().nullable(),
        rejoue: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'AppelEnDirect' });
export type AppelEnDirect = z.infer<typeof AppelEnDirect>;

/** Clés Valkey du chemin rapide ; la durée de vie suit la fin de la séance. */
export const CLES_EMARGEMENT = {
  /** Séance préchargée (hash) : organisation, libellé, début, fin, distanciel. */
  seance: (seanceId: string) => `emargement:seance:${seanceId}`,
  /** Attendus (hash) : identifiant du compte → identifiant de la fiche (RG-00-17). */
  attendus: (seanceId: string) => `emargement:attendus:${seanceId}`,
  /** Présences (hash) : fiche → scan en JSON, écrit une seule fois (RG-00-18). */
  presences: (seanceId: string) => `emargement:presences:${seanceId}`,
  /** Flux lu par le worker, qui écrit les présences par lots dans PostgreSQL. */
  /** Liste des attendus en cours de chargement, basculée d'un coup (RENAME) une fois complète. */
  attendusEnChargement: (seanceId: string) => `emargement:attendus-chargement:${seanceId}`,
  /** Marqueur : séance préchargée récemment (une fois toutes les 5 minutes au plus). */
  prechargee: (seanceId: string) => `emargement:prechargee:${seanceId}`,
  flux: 'emargement:flux',
  groupeFlux: 'persistance',
} as const;

/** Entrée du flux et valeur stockée dans le hash des présences. */
export interface PresenceEnCache {
  organisationId: string;
  seanceId: string;
  personneId: string;
  scanneLe: string;
  mode: 'qr' | 'code' | 'manuel';
  rejoue: boolean;
}

/** Séance telle que préchargée dans Valkey (RG-00-17). */
export interface SeanceEnCache {
  organisationId: string;
  libelle: string;
  debut: number;
  fin: number;
  distanciel: boolean;
}

/** Les clés du cache vivent jusqu'à une heure après la fin de la séance (secondes Unix). */
export const expirationCache = (finMs: number) => Math.ceil(finMs / 1000) + 3600;

/** Taille des paquets écrits dans Valkey : entre deux paquets, les scans passent. */
export const PAQUET_CACHE = 1000;

/**
 * Commandes Valkey du préchargement, partagées par l'API (ouverture de l'appel) et le worker
 * (préchargement planifié), à envoyer en pipeline et non en transaction : les attendus (compte →
 * fiche) sont écrits par paquets dans une clé de chargement, puis basculés d'un coup (RENAME). Valkey
 * reste disponible pour les scans pendant le chargement, et aucun scan ne voit une liste partielle.
 */
export function commandesPrechargement(
  seanceId: string,
  seance: SeanceEnCache,
  attendus: ReadonlyMap<string, string>,
): string[][] {
  const fin = String(expirationCache(seance.fin));
  const enChargement = CLES_EMARGEMENT.attendusEnChargement(seanceId);
  const paires = [...attendus].flat();
  const commandes = [['del', enChargement]];
  for (let debut = 0; debut < paires.length; debut += 2 * PAQUET_CACHE) {
    commandes.push(['hset', enChargement, ...paires.slice(debut, debut + 2 * PAQUET_CACHE)]);
  }
  commandes.push(
    paires.length > 0
      ? ['rename', enChargement, CLES_EMARGEMENT.attendus(seanceId)]
      : ['del', CLES_EMARGEMENT.attendus(seanceId)],
  );
  if (paires.length > 0) commandes.push(['expireat', CLES_EMARGEMENT.attendus(seanceId), fin]);
  commandes.push(
    [
      'hset',
      CLES_EMARGEMENT.seance(seanceId),
      'organisationId',
      seance.organisationId,
      'libelle',
      seance.libelle,
      'debut',
      String(seance.debut),
      'fin',
      String(seance.fin),
      'distanciel',
      seance.distanciel ? '1' : '0',
    ],
    ['expireat', CLES_EMARGEMENT.seance(seanceId), fin],
  );
  return commandes;
}

/** Relit une séance préchargée ; rien si elle ne l'est pas. */
export function lireSeanceEnCache(valeurs: Record<string, string>): SeanceEnCache | null {
  if (!valeurs.organisationId) return null;
  return {
    organisationId: valeurs.organisationId,
    libelle: valeurs.libelle ?? '',
    debut: Number(valeurs.debut),
    fin: Number(valeurs.fin),
    distanciel: valeurs.distanciel === '1',
  };
}

/** Séance proche (en cours, à venir dans les 12 heures, ou finie depuis moins d'une heure). */
export const SeanceProche = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    debut: z.iso.datetime(),
    fin: z.iso.datetime(),
    distanciel: z.boolean(),
    intervenant: z.string().nullable(),
  })
  .meta({ id: 'SeanceProche' });
export type SeanceProche = z.infer<typeof SeanceProche>;

/** Préfixe des sessions de Better Auth dans Valkey (stockage secondaire de l'API). */
export const PREFIXE_SESSIONS = 'auth:';

/** Session lue en base, au format que Better Auth garde en cache : { session, user }. */
export interface SessionEnBase {
  session: { token: string; expiresAt: Date } & Record<string, unknown>;
  user: Record<string, unknown>;
}

/**
 * Remise en cache de sessions lues en base (RG-00-17) : après un redémarrage de Valkey, Better Auth
 * relit les sessions en base sans les remettre en cache ; sans cela, chaque scan referait une
 * requête SQL. N'écrit que les sessions absentes du cache (NX), jusqu'à leur expiration.
 */
export function commandesSessions(sessions: readonly SessionEnBase[], maintenant = Date.now()) {
  return sessions.flatMap(({ session, user }) => {
    const ttl = Math.floor((session.expiresAt.getTime() - maintenant) / 1000);
    return ttl > 0
      ? [
          [
            'set',
            PREFIXE_SESSIONS + session.token,
            JSON.stringify({ session, user }),
            'EX',
            String(ttl),
            'NX',
          ],
        ]
      : [];
  });
}
