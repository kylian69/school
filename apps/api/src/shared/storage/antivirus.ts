import { Socket } from 'node:net';

export type ScanResult = { clean: true } | { clean: false; signature: string };

/** Analyse antivirus d'un fichier déposé, avant toute mise à disposition (architecture section 4). */
export interface VirusScanner {
  scan(content: Buffer): Promise<ScanResult>;
}

const CHUNK_BYTES = 64 * 1024;

/**
 * Client clamd (commande INSTREAM) : le fichier est envoyé par blocs préfixés de leur taille,
 * terminés par un bloc vide. Réponse : `stream: OK` ou `stream: <signature> FOUND`.
 */
export class ClamdScanner implements VirusScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  scan(content: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy(new Error('Antivirus injoignable : délai dépassé.'));
      });
      socket.on('error', (error) => {
        reject(new Error(`Antivirus injoignable : ${error.message}`, { cause: error }));
      });
      socket.on('data', (data) => chunks.push(data));
      socket.on('end', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (reply.endsWith('OK')) resolve({ clean: true });
        else if (reply.endsWith('FOUND')) {
          resolve({
            clean: false,
            signature: reply.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, ''),
          });
        } else reject(new Error(`Réponse inattendue de l'antivirus : ${reply}`));
      });
      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < content.length; offset += CHUNK_BYTES) {
          const chunk = content.subarray(offset, offset + CHUNK_BYTES);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

/** Analyse désactivée explicitement (ANTIVIRUS_DISABLED=true) : tout fichier est accepté. */
export class DisabledScanner implements VirusScanner {
  scan(): Promise<ScanResult> {
    return Promise.resolve({ clean: true });
  }
}
