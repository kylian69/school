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

/**
 * Commandes Valkey du préchargement, partagées par l'API (ouverture de l'appel) et le worker
 * (préchargement planifié) : la séance et ses attendus (compte → fiche), remplacés en bloc.
 */
export function commandesPrechargement(
  seanceId: string,
  seance: SeanceEnCache,
  attendus: ReadonlyMap<string, string>,
): string[][] {
  const fin = String(expirationCache(seance.fin));
  const commandes = [
    ['del', CLES_EMARGEMENT.attendus(seanceId)],
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
  ];
  if (attendus.size > 0) {
    commandes.push(
      ['hset', CLES_EMARGEMENT.attendus(seanceId), ...[...attendus].flat()],
      ['expireat', CLES_EMARGEMENT.attendus(seanceId), fin],
    );
  }
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
