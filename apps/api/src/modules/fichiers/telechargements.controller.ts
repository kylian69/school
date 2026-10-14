import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Authenticated } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { TelechargementsService } from './telechargements.service.js';

/** En-tête Content-Disposition qui force le téléchargement, avec un nom ASCII de repli (RFC 6266). */
export function dispositionPieceJointe(nom: string): string {
  const propre = nom.replace(/[^\p{L}\p{N}._ -]/gu, '_');
  const ascii = propre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}

/**
 * Téléchargement d'un fichier privé par adresse chiffrée (ADR 0007) : la session est exigée et doit
 * être celle du compte à qui l'adresse a été donnée. Le fichier est relayé en flux, jamais mis en
 * cache ni affiché dans la page.
 */
@Controller('api/fichiers/telechargement')
export class TelechargementsController {
  constructor(private readonly telechargements: TelechargementsService) {}

  @Get()
  @Authenticated()
  @ApiContract({
    summary: 'Télécharger un fichier privé (contrat signé, export…), par adresse chiffrée',
    query: z.object({ jeton: z.string() }),
    response: z.string(),
  })
  async telecharger(
    @Query('jeton') jeton: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const fichier = await this.telechargements.ouvrir(jeton ?? '', request.userId, request.ip);
    reply
      .header('content-type', fichier.type)
      .header('content-disposition', dispositionPieceJointe(fichier.nom))
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('referrer-policy', 'no-referrer');
    if (fichier.taille !== undefined) reply.header('content-length', String(fichier.taille));
    await reply.send(fichier.flux);
  }
}
