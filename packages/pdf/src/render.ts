import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

/**
 * Rendu des documents officiels avec Typst (architecture section 6). Le rendu est déterministe :
 * mêmes modèle et données, même PDF octet pour octet, donc même empreinte SHA-256 (RG-07-17).
 * L'horodatage du PDF est fixé par l'appelant (date d'émission du document), jamais l'heure courante.
 */
export interface RenderOptions {
  /** Source Typst du modèle. Les données sont lues par `json(bytes(sys.inputs.donnees))`. */
  template: string;
  donnees: unknown;
  /** Date d'émission inscrite dans le PDF. */
  emisLe: Date;
}

export interface RenderedPdf {
  pdf: Buffer;
  sha256: string;
  pages: number;
}

export class PdfRenderError extends Error {
  override name = 'PdfRenderError';
}

let compiler: NodeCompiler | undefined;
const getCompiler = () => (compiler ??= NodeCompiler.create());

export function renderPdf(options: RenderOptions): RenderedPdf {
  const typst = getCompiler();
  const result = typst.compile({
    mainFileContent: options.template,
    inputs: { donnees: JSON.stringify(options.donnees) },
    resetRead: true,
  });
  const document = result.result;
  if (!document) {
    const diagnostics = result.takeDiagnostics()?.shortDiagnostics ?? [];
    throw new PdfRenderError(`Le modèle Typst ne compile pas : ${JSON.stringify(diagnostics)}`);
  }
  let pdf: Buffer;
  try {
    pdf = typst.pdf(document, {
      pdfStandard: 'a-2b',
      creationTimestamp: Math.floor(options.emisLe.getTime() / 1000),
    });
  } catch (error) {
    throw new PdfRenderError(`Rendu PDF impossible : ${String(error)}`, { cause: error });
  }
  return {
    pdf,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    pages: document.numOfPages,
  };
}

/** Charge un modèle livré avec le paquet (dossier `templates`). */
export async function loadTemplate(name: string): Promise<string> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new PdfRenderError(`Nom de modèle invalide : ${name}`);
  return readFile(new URL(`../templates/${name}.typ`, import.meta.url), 'utf8');
}
