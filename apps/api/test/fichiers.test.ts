import { createServer, type Server } from 'node:net';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { newId } from '@scolaly/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ConfigurationError, loadEnv } from '../src/config/env.js';
import {
  ClamdScanner,
  type ScanResult,
  type VirusScanner,
} from '../src/shared/storage/antivirus.js';
import { ObjectStorage } from '../src/shared/storage/object-storage.js';
import { detectType, UploadRejectedError, UploadService } from '../src/shared/storage/uploads.js';
import { testEnv } from './helpers.js';

const MARQUEUR_VIRUS = 'VIRUS-DE-TEST-SCOLALY';

/** Faux clamd : décode le protocole INSTREAM et signale le marqueur de test. */
function fakeClamd(reply?: string): Promise<{ server: Server; port: number; received: Buffer[] }> {
  const received: Buffer[] = [];
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      const header = 'zINSTREAM\0';
      if (buffer.length < header.length) return;
      let offset = header.length;
      const chunks: Buffer[] = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          const content = Buffer.concat(chunks);
          received.push(content);
          socket.end(
            reply ??
              (content.includes(MARQUEUR_VIRUS)
                ? 'stream: Scolaly-Test-Signature FOUND\0'
                : 'stream: OK\0'),
          );
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        chunks.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address ? address.port : 0,
        received,
      });
    }),
  );
}

describe('Antivirus (clamd, protocole INSTREAM)', () => {
  it('déclare sain un fichier propre et transmet tout son contenu, bloc par bloc', async () => {
    const { server, port, received } = await fakeClamd();
    try {
      const contenu = Buffer.alloc(200_000, 7);
      expect(await new ClamdScanner('127.0.0.1', port).scan(contenu)).toEqual({ clean: true });
      expect(received[0]?.equals(contenu)).toBe(true);
    } finally {
      server.close();
    }
  });

  it('signale la signature détectée', async () => {
    const { server, port } = await fakeClamd();
    try {
      expect(
        await new ClamdScanner('127.0.0.1', port).scan(Buffer.from(`x${MARQUEUR_VIRUS}x`)),
      ).toEqual({
        clean: false,
        signature: 'Scolaly-Test-Signature',
      });
    } finally {
      server.close();
    }
  });

  it("échoue clairement si l'antivirus est injoignable ou répond de façon inattendue", async () => {
    await expect(new ClamdScanner('127.0.0.1', 1, 2000).scan(Buffer.from('a'))).rejects.toThrow(
      /Antivirus injoignable/,
    );
    const { server, port } = await fakeClamd('INSTREAM size limit exceeded. ERROR\0');
    try {
      await expect(new ClamdScanner('127.0.0.1', port).scan(Buffer.from('a'))).rejects.toThrow(
        /Réponse inattendue/,
      );
    } finally {
      server.close();
    }
  });

  it("exige CLAMAV_HOST, sauf désactivation explicite de l'analyse", () => {
    const sansAntivirus = {
      ...testEnv(),
      S3_FORCE_PATH_STYLE: 'true',
      ANTIVIRUS_DISABLED: 'false',
      CLAMAV_HOST: undefined,
    };
    expect(() => loadEnv(sansAntivirus as unknown as NodeJS.ProcessEnv)).toThrow(
      ConfigurationError,
    );
    expect(() => loadEnv(sansAntivirus as unknown as NodeJS.ProcessEnv)).toThrow(
      /CLAMAV_HOST : obligatoire/,
    );
  });
});

describe('Dépôt de fichiers et liens signés (stockage S3)', () => {
  const env = testEnv();
  const storage = ObjectStorage.fromEnv(env);
  const verdicts: VirusScanner = {
    scan: (content): Promise<ScanResult> =>
      Promise.resolve(
        content.includes(MARQUEUR_VIRUS) ? { clean: false, signature: 'Test' } : { clean: true },
      ),
  };
  const uploads = new UploadService(storage, verdicts);
  const organisationId = newId();
  const policy = { maxBytes: 1024, types: ['pdf', 'png'] } as const;
  const pdf = Buffer.from('%PDF-1.7\nContenu fictif\n%%EOF');
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: inject('s3Endpoint'),
    forcePathStyle: true,
    credentials: { accessKeyId: inject('s3AccessKey'), secretAccessKey: inject('s3SecretKey') },
  });
  const objetsDeLOrganisation = async () =>
    (
      await s3.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: `organisations/${organisationId}/`,
        }),
      )
    ).KeyCount ?? 0;

  beforeAll(async () => {
    await storage.ensureBucket();
  });

  afterAll(() => {
    storage.destroy();
    s3.destroy();
  });

  it('reconnaît le type par la signature du fichier, pas par son nom', () => {
    expect(detectType(pdf)).toBe('pdf');
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectType(Buffer.from('pas un PDF'))).toBeNull();
  });

  it("stocke un fichier valide sous l'organisation et le sert par un lien signé de courte durée", async () => {
    const stocke = await uploads.store(organisationId, 'essai', pdf, policy);
    expect(stocke).toMatchObject({ type: 'pdf', mime: 'application/pdf', size: pdf.length });
    expect(stocke.key).toMatch(new RegExp(`^organisations/${organisationId}/essai/[0-9a-f-]{36}$`));

    const url = await storage.signedDownloadUrl(stocke.key, { filename: 'relevé de notes.pdf' });
    expect(url).toContain('X-Amz-Expires=300');
    const reponse = await fetch(url);
    expect(reponse.status).toBe(200);
    expect(Buffer.from(await reponse.arrayBuffer()).equals(pdf)).toBe(true);
    expect(reponse.headers.get('content-disposition')).toMatch(
      /^attachment; filename\*=UTF-8''relev/,
    );
    expect(reponse.headers.get('x-amz-meta-sha256')).toBe(stocke.sha256);
  });

  it('un lien signé altéré est refusé', async () => {
    const stocke = await uploads.store(organisationId, 'essai', pdf, policy);
    const url = await storage.signedDownloadUrl(stocke.key, { filename: 'a.pdf' });
    expect(
      (await fetch(url.replace(/X-Amz-Signature=[0-9a-f]+/, 'X-Amz-Signature=00'))).status,
    ).toBe(403);
  });

  it.each([
    ['vide', Buffer.alloc(0)],
    ['trop-volumineux', Buffer.concat([pdf, Buffer.alloc(2000)])],
    ['type-non-autorise', Buffer.from('<script>alert(1)</script>')],
    ['virus', Buffer.concat([pdf, Buffer.from(MARQUEUR_VIRUS)])],
  ] as const)(
    'refuse un fichier %s, avec un message clair, sans rien stocker',
    async (motif, contenu) => {
      const avant = await objetsDeLOrganisation();
      const erreur = await uploads
        .store(organisationId, 'essai', contenu, policy)
        .catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(UploadRejectedError);
      expect((erreur as UploadRejectedError).reason).toBe(motif);
      expect((erreur as UploadRejectedError).message.length).toBeGreaterThan(20);
      expect(await objetsDeLOrganisation()).toBe(avant);
    },
  );
});
