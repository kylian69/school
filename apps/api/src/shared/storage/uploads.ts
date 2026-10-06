import { createHash } from 'node:crypto';
import { newId } from '@scolaly/db';
import type { VirusScanner } from './antivirus.js';
import { ObjectStorage } from './object-storage.js';

/** Types de fichiers reconnus par leur signature (octets de tête), jamais par leur extension. */
const SIGNATURES = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  // Un SVG est du texte, sans signature : reconnu par son début, et son contenu analysé à part.
  svg: { mime: 'image/svg+xml', magic: null },
  // Classeur Excel : une archive ZIP (son contenu est vérifié à la lecture).
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  // Un CSV est du texte sans signature : accepté seulement là où la politique l'autorise.
  csv: { mime: 'text/csv', magic: null },
} as const;

const DEBUT_SVG = /^\s*<(?:\?xml|svg[\s>]|!--|!DOCTYPE\s+svg)/i;

export type FileType = keyof typeof SIGNATURES;

export interface UploadPolicy {
  maxBytes: number;
  types: readonly FileType[];
}

export interface StoredFile {
  key: string;
  type: FileType;
  mime: string;
  size: number;
  sha256: string;
}

export type UploadRejection = 'vide' | 'trop-volumineux' | 'type-non-autorise' | 'virus';

const MESSAGES: Record<UploadRejection, string> = {
  vide: 'Le fichier est vide. Choisissez un autre fichier.',
  'trop-volumineux': 'Le fichier dépasse la taille autorisée. Réduisez-le puis réessayez.',
  'type-non-autorise': "Ce type de fichier n'est pas accepté ici. Formats autorisés : ",
  virus: 'Le fichier a été bloqué par l’antivirus. Analysez votre poste avant de réessayer.',
};

export class UploadRejectedError extends Error {
  override name = 'UploadRejectedError';
  constructor(
    readonly reason: UploadRejection,
    detail = '',
  ) {
    super(`${MESSAGES[reason]}${detail}`);
  }
}

export function detectType(content: Buffer): FileType | null {
  for (const [type, { magic }] of Object.entries(SIGNATURES) as [
    FileType,
    (typeof SIGNATURES)[FileType],
  ][]) {
    if (magic?.every((byte, i) => content[i] === byte)) return type;
  }
  return DEBUT_SVG.test(content.subarray(0, 512).toString('utf8')) ? 'svg' : null;
}

/**
 * Dépôt d'un fichier : taille, type réel, analyse antivirus, puis stockage sous une clé aléatoire
 * de l'organisation. Rien n'est stocké si une vérification échoue.
 */
export class UploadService {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly scanner: VirusScanner,
  ) {}

  async store(
    organisationId: string,
    category: string,
    content: Buffer,
    policy: UploadPolicy,
  ): Promise<StoredFile> {
    if (content.length === 0) throw new UploadRejectedError('vide');
    if (content.length > policy.maxBytes) throw new UploadRejectedError('trop-volumineux');
    // Texte sans octet nul : un CSV, si la politique en accepte.
    const type =
      detectType(content) ??
      (policy.types.includes('csv') && !content.subarray(0, 8192).includes(0) ? 'csv' : null);
    if (!type || !policy.types.includes(type)) {
      throw new UploadRejectedError('type-non-autorise', policy.types.join(', ').toUpperCase());
    }
    const verdict = await this.scanner.scan(content);
    if (!verdict.clean) throw new UploadRejectedError('virus');

    const key = ObjectStorage.key(organisationId, category, newId());
    const sha256 = createHash('sha256').update(content).digest('hex');
    const { mime } = SIGNATURES[type];
    await this.storage.put(key, content, mime, sha256);
    return { key, type, mime, size: content.length, sha256 };
  }
}
