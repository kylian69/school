import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { WorkerEnv } from './config/env.js';

/**
 * Stockage des fichiers (compatible S3, ADR 0003) vu du worker : suppression seulement, pour les
 * effacements de conservation. Null quand l'instance ne l'a pas configuré.
 */
export function suppressionStockage(env: WorkerEnv): ((cle: string) => Promise<void>) | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  const client = new S3Client({
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });
  const bucket = env.S3_BUCKET;
  return async (cle) => {
    // Supprimer un objet absent réussit : l'effacement reste idempotent.
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: cle }));
  };
}
