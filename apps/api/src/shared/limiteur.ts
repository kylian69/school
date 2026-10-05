import { HttpException, HttpStatus } from '@nestjs/common';
import type { Redis } from 'ioredis';

/** Limitation de débit simple dans Valkey (fenêtre fixe), pour les routes publiques. */
export async function limiterDebit(
  valkey: Redis,
  cle: string,
  maximum: number,
  fenetreSecondes: number,
): Promise<void> {
  const compteur = `limite:${cle}`;
  const [[, valeur] = [null, 0]] =
    (await valkey.multi().incr(compteur).expire(compteur, fenetreSecondes, 'NX').exec()) ?? [];
  if (Number(valeur) > maximum) {
    throw new HttpException(
      'Trop de tentatives. Patientez une minute avant de réessayer.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
