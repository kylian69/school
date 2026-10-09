import { BadRequestException } from '@nestjs/common';
import { IMPORT_TAILLE_MAX, TYPES_FICHIER_IMPORT } from '@scolaly/contracts';
import { lireCsv, type TableauLu } from '@scolaly/domain';
import { readSheet } from 'read-excel-file/node';

const FORMATS = new Map<string, 'csv' | 'xlsx'>(Object.entries(TYPES_FICHIER_IMPORT));

const invalide = (message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`fichier : ${message}`],
  });

/** Format d'un fichier déposé (CSV ou Excel) d'après son type, ou null s'il n'est pas reconnu. */
export const formatTableur = (typeContenu: string | undefined) =>
  FORMATS.get((typeContenu ?? '').split(';')[0] ?? '') ?? null;

/** Texte d'un CSV : UTF-8 s'il est valide, sinon Windows-1252 (RG-01-17, détection automatique). */
function decoder(contenu: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contenu);
  } catch {
    return new TextDecoder('windows-1252').decode(contenu);
  }
}

/**
 * Valeur d'une cellule Excel en texte ; une date devient AAAA-MM-JJ, une date avec heure
 * AAAA-MM-JJTHH:MM et une heure seule (jour 0 d'Excel) HH:MM.
 */
function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (valeur instanceof Date) {
    // Arrondi à la minute : Excel stocke l'heure en fraction de jour.
    const arrondie = new Date(Math.round(valeur.getTime() / 60_000) * 60_000);
    const iso = arrondie.toISOString();
    const heure = iso.slice(11, 16);
    if (arrondie.getUTCFullYear() < 1900) return heure;
    return heure === '00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)}T${heure}`;
  }
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  if (typeof valeur === 'number' || typeof valeur === 'string') return String(valeur);
  return '';
}

/**
 * Lit la première feuille d'un classeur Excel ou un CSV : en-têtes et lignes non vides. Le format
 * vaut « csv » ou « xlsx » (colonne fichier_type des imports enregistrés).
 */
export async function lireTableau(contenu: Buffer, format: string): Promise<TableauLu> {
  if (format === 'csv') return lireCsv(decoder(contenu));
  let lignes;
  try {
    lignes = await readSheet(contenu);
  } catch {
    throw invalide(
      'Ce classeur Excel est illisible. Enregistrez-le de nouveau au format .xlsx, ou en CSV.',
    );
  }
  const texte = lignes.map((l) => l.map(cellule)).filter((l) => l.some((v) => v.trim() !== ''));
  const [colonnes = [], ...donnees] = texte;
  return { colonnes: colonnes.map((c) => c.trim()), lignes: donnees };
}

/** Texte d'un fichier déposé (UTF-8 ou Windows-1252), par exemple un fichier iCal. */
export const decoderTexte = decoder;

/** Contrôle et lecture d'un fichier déposé tel quel (10 Mo au plus). */
export async function lireFichierTableur(
  contenu: unknown,
  typeContenu: string | undefined,
): Promise<TableauLu> {
  const format = formatTableur(typeContenu);
  if (!format || !Buffer.isBuffer(contenu)) {
    throw invalide('Déposez un fichier CSV ou Excel (.xlsx).');
  }
  if (contenu.length > IMPORT_TAILLE_MAX) {
    throw invalide('Le fichier dépasse 10 Mo. Découpez-le en plusieurs fichiers.');
  }
  return lireTableau(contenu, format);
}
