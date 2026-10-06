/**
 * Doublons de personnes (RG-01-06, RG-01-07) : avant toute création, on cherche une fiche de même
 * email, ou de même nom, prénom et date de naissance, et on propose la fiche existante.
 */
export type MotifDoublon = 'email' | 'identite';

export interface IdentiteComparee {
  nom: string;
  prenom: string;
  email: string;
  dateNaissance: string | null;
}

/** Forme comparable d'un nom : minuscules, sans accents, tirets et espaces réduits. */
export function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s'’-]+/g, ' ')
    .trim();
}

export function motifsDoublon(
  candidat: IdentiteComparee,
  existant: IdentiteComparee,
): MotifDoublon[] {
  const motifs: MotifDoublon[] = [];
  if (candidat.email.trim().toLowerCase() === existant.email.trim().toLowerCase()) {
    motifs.push('email');
  }
  if (
    candidat.dateNaissance !== null &&
    candidat.dateNaissance === existant.dateNaissance &&
    normaliserNom(candidat.nom) === normaliserNom(existant.nom) &&
    normaliserNom(candidat.prenom) === normaliserNom(existant.prenom)
  ) {
    motifs.push('identite');
  }
  return motifs;
}

/** Date de naissance plausible : ni future, ni antérieure à 1900. */
export function dateNaissancePlausible(dateNaissance: string, aujourdhui: string): boolean {
  return dateNaissance >= '1900-01-01' && dateNaissance <= aujourdhui;
}
