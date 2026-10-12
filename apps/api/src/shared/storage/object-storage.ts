import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Env } from '../../config/env.js';

/** Durée de validité par défaut d'une adresse de téléchargement signée (architecture section 4). */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Stockage des fichiers dans un service compatible S3 (Garage, Ceph…). Les clés sont préfixées
 * par organisation.
 */
export class ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromEnv(env: Env): ObjectStorage {
    const client = new S3Client({
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    });
    return new ObjectStorage(client, env.S3_BUCKET);
  }

  /** Clé d'un objet : toujours sous `organisations/<id>/`, jamais construite à partir d'un nom de fichier. */
  static key(organisationId: string, category: string, id: string): string {
    if (!/^[a-z0-9-]+$/.test(category))
      throw new Error(`Catégorie de fichier invalide : ${category}`);
    return `organisations/${organisationId}/${category}/${id}`;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string, sha256: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: { sha256 },
      }),
    );
  }

  /** Contenu d'un objet, pour le servir par l'API (logo de l'école). */
  async get(key: string): Promise<Buffer> {
    const reponse = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!reponse.Body) throw new Error(`Objet vide : ${key}`);
    return Buffer.from(await reponse.Body.transformToByteArray());
  }

  /** Suppression d'un objet devenu inutile (fichier d'import traité ou expiré). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Contenu d'un objet en flux, pour le relayer par l'API sans le charger en mémoire : le stockage
   * n'est jamais exposé au navigateur (ADR 0007). Renvoie null si l'objet n'existe pas.
   */
  async lireFlux(key: string): Promise<{ flux: Readable; taille: number | undefined } | null> {
    try {
      const reponse = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!(reponse.Body instanceof Readable)) throw new Error(`Objet illisible : ${key}`);
      return { flux: reponse.Body, taille: reponse.ContentLength };
    } catch (erreur) {
      if (erreur instanceof NoSuchKey) return null;
      throw erreur;
    }
  }

  destroy(): void {
    this.client.destroy();
  }
}
