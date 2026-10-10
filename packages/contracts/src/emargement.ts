import { z } from 'zod';

/**
 * Émargement (module 06) : formats échangés et clés du cache Valkey partagées par l'API (scan,
 * ouverture de l'appel) et le worker (préchargement, écriture par lots).
 */

/**
 * RGPD-03 : position du téléphone au moment du scan, avec l'autorisation de l'apprenant. Comparée
 * au périmètre de l'établissement à la réception puis jetée : jamais stockée ni journalisée.
 */
export const PositionScan = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** Rayon d'incertitude annoncé par le téléphone, en mètres. */
    precisionMetres: z.number().min(0).max(1_000_000),
  })
  .meta({ id: 'PositionScan' });
export type PositionScan = z.infer<typeof PositionScan>;

/** RG-06-10 : seul résultat conservé du contrôle de localisation ; null : pas de contrôle. */
export const ResultatLocalisation = z.enum(['sur-place', 'hors-site', 'inconnu']);
export type ResultatLocalisation = z.infer<typeof ResultatLocalisation>;

/**
 * Scan du QR par l'apprenant (RG-06-06). `horsLigne` : scan conservé puis renvoyé (RG-00-19).
 * `position` : facultative, absente si l'apprenant refuse ou si le téléphone n'en donne pas.
 */
export const ScanEmargement = z
  .object({
    jeton: z.string().max(200),
    horsLigne: z.boolean().optional(),
    position: PositionScan.optional(),
  })
  .meta({ id: 'ScanEmargement' });
export type ScanEmargement = z.infer<typeof ScanEmargement>;

/** Code à 6 chiffres saisi à la main (RG-06-05, RG-06-08). */
export const CodeEmargement = z
  .object({
    seanceId: z.uuid(),
    code: z.string().regex(/^\d{6}$/, 'Saisissez les 6 chiffres.'),
    position: PositionScan.optional(),
  })
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
    /** RG-06-09 : hors site ou inconnu, la présence est enregistrée « à vérifier ». */
    localisation: ResultatLocalisation.nullable(),
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
        /** RG-06-11 : résultat du contrôle de localisation, null sans contrôle. */
        localisation: ResultatLocalisation.nullable(),
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
  /** RG-06-10 : résultat du contrôle (absent : pas de contrôle, ou présence d'avant I4.3). */
  localisation?: ResultatLocalisation | null;
}

/**
 * RG-06-10 : périmètre de localisation de l'établissement de la séance, préchargé avec elle
 * (architecture, section 5) : le scan le compare sans requête SQL.
 */
export interface PerimetreEnCache {
  latitude: number | null;
  longitude: number | null;
  rayonMetres: number;
  plagesIp: string[];
}

/** Séance telle que préchargée dans Valkey (RG-00-17). */
export interface SeanceEnCache {
  organisationId: string;
  libelle: string;
  debut: number;
  fin: number;
  distanciel: boolean;
  /** Null : pas de contrôle (désactivé, séance à distance ou périmètre non renseigné). */
  localisation: PerimetreEnCache | null;
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
      'localisation',
      seance.localisation ? JSON.stringify(seance.localisation) : '',
    ],
    ['expireat', CLES_EMARGEMENT.seance(seanceId), fin],
  );
  return commandes;
}

/**
 * Retire une séance du cache (annulée, reportée ou changée) : le scan la voit fermée, et le
 * préchargement planifié la relit à son prochain passage s'il y a lieu. Les présences déjà
 * enregistrées restent, le worker les écrit en base.
 */
export function commandesRetraitSeance(seanceId: string): string[][] {
  return [
    [
      'del',
      CLES_EMARGEMENT.seance(seanceId),
      CLES_EMARGEMENT.attendus(seanceId),
      CLES_EMARGEMENT.attendusEnChargement(seanceId),
      CLES_EMARGEMENT.prechargee(seanceId),
    ],
  ];
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
    localisation: valeurs.localisation
      ? (JSON.parse(valeurs.localisation) as PerimetreEnCache)
      : null,
  };
}

/**
 * RG-06-08, RG-06-10 : périmètre à contrôler pour une séance ; null si le contrôle est désactivé,
 * si la séance est à distance, ou si l'établissement n'a ni coordonnées ni plage d'adresses IP.
 */
export function perimetreAControler(
  distanciel: boolean,
  etablissement: {
    localisationActive: boolean;
    localisationLatitude: number | null;
    localisationLongitude: number | null;
    localisationRayon: number;
    localisationPlagesIp: string[];
  } | null,
): PerimetreEnCache | null {
  if (distanciel || !etablissement?.localisationActive) return null;
  const coordonnees =
    etablissement.localisationLatitude !== null && etablissement.localisationLongitude !== null;
  if (!coordonnees && etablissement.localisationPlagesIp.length === 0) return null;
  return {
    latitude: coordonnees ? etablissement.localisationLatitude : null,
    longitude: coordonnees ? etablissement.localisationLongitude : null,
    rayonMetres: etablissement.localisationRayon,
    plagesIp: etablissement.localisationPlagesIp,
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
    /** RG-04-14 : badge « modifié », affiché quelques jours après la dernière modification. */
    modifiee: z.boolean(),
    /** RGPD-03 : le scan de cette séance compare la position au périmètre du campus. */
    localisation: z.boolean(),
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
