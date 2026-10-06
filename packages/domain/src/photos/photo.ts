/**
 * Photo des apprenants (US-01-20 ; RG-01-26, RG-01-27) : JPEG ou PNG de 5 Mo au plus, recadrée en
 * portrait carré et ramenée à 512 px. Déposée par la scolarité, elle est validée d'office ; déposée
 * par l'apprenant, elle attend la validation de la scolarité, qui peut la refuser avec un motif.
 */
export const PHOTO_TAILLE_MAX = 5 * 1024 * 1024;
export const PHOTO_COTE = 512;

/**
 * Carré à extraire d'une image : le plus grand possible, centré horizontalement. Sur une image en
 * hauteur, il est placé au quart supérieur, là où se trouve d'ordinaire le visage d'un portrait.
 */
export function cadrageCarre(
  largeur: number,
  hauteur: number,
): { left: number; top: number; width: number; height: number } {
  const cote = Math.min(largeur, hauteur);
  return {
    left: Math.floor((largeur - cote) / 2),
    top: hauteur > largeur ? Math.floor((hauteur - cote) / 4) : 0,
    width: cote,
    height: cote,
  };
}

export type StatutPhoto = 'en_attente' | 'validee' | 'refusee';
export type RefusDecisionPhoto = 'rien-a-valider' | 'motif-manquant';

/** Une photo en attente se valide, ou se refuse avec un motif expliqué à l'apprenant. */
export function verifierDecisionPhoto(
  statut: StatutPhoto | null,
  decision: 'valider' | 'refuser',
  motif: string | null | undefined,
): { ok: true } | { ok: false; refus: RefusDecisionPhoto } {
  if (statut !== 'en_attente') return { ok: false, refus: 'rien-a-valider' };
  if (decision === 'refuser' && !motif?.trim()) return { ok: false, refus: 'motif-manquant' };
  return { ok: true };
}

/**
 * Matricule désigné par un fichier d'une archive de photos (« 2026-00042.jpg », dossiers
 * ignorés) ; null pour un fichier qui n'est pas une photo ou un fichier caché.
 */
export function matriculeDuFichier(chemin: string): string | null {
  const nom = chemin.slice(Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\')) + 1);
  if (nom.startsWith('.')) return null;
  const trouve = /^(.+)\.(jpe?g|png)$/i.exec(nom);
  return trouve?.[1]?.trim() || null;
}
