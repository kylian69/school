import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { FiltreFeuilles, MoisFeuille } from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ACCESS_RESOLVER, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { dispositionPieceJointe } from '../fichiers/index.js';
import { FeuillesService, type PdfProduit } from './feuilles.service.js';

/** Remise d'un PDF comme les fichiers privés (ADR 0007, point 5), avec son empreinte. */
const envoyer = (reply: FastifyReply, produit: PdfProduit) =>
  reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', dispositionPieceJointe(produit.nom))
    .header('content-length', String(produit.pdf.length))
    .header('x-empreinte-sha256', produit.sha256)
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "default-src 'none'; sandbox")
    .header('referrer-policy', 'no-referrer')
    .send(produit.pdf);

/**
 * Feuilles d'émargement PDF (I4.4 ; RG-06-25, RG-06-26, US-06-11), produites à la demande. Le
 * document n'est remis qu'une fois sa trace validée en base (journal d'audit, empreinte).
 */
@Controller('api')
export class FeuillesController {
  constructor(
    private readonly feuilles: FeuillesService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** Périmètre (promotion du public, ou intervenant de la séance) contrôlé par le service. */
  @Get('seances/:id/appel/feuille/pdf')
  @RequirePermission('emargement:feuilles')
  @ApiContract({
    summary:
      'Feuille d’émargement PDF d’une séance (version signée, la dernière par défaut), tracée',
    query: z.object({ version: z.string().optional() }),
    response: z.string(),
  })
  async seance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version') version: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const numero = version === undefined ? null : Number(version);
    if (numero !== null && (!Number.isInteger(numero) || numero < 1))
      throw new BadRequestException(
        'Numéro de version invalide : choisissez une version de la liste.',
      );
    const produit = await this.feuilles.feuilleSeance(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      numero,
      request.ip,
    );
    RequestContext.apresValidation(async () => {
      await envoyer(reply, produit);
    });
  }

  /** E-06-09 : périmètre (promotions couvertes par la permission) contrôlé par le service. */
  @Get('assiduite/feuilles')
  @RequirePermission('emargement:feuilles', 'promotion')
  @ApiContract({
    summary: 'Feuilles d’émargement ou récapitulatifs mensuels PDF d’une promotion, tracés',
    query: FiltreFeuilles,
    response: z.string(),
  })
  async promotion(
    @Query() filtre: FiltreFeuilles,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const produit = await this.feuilles.feuillesPromotion(
      RequestContext.tx(),
      RequestContext.access(),
      filtre,
      request.ip,
    );
    RequestContext.apresValidation(async () => {
      await envoyer(reply, produit);
    });
  }

  /** E-06-04 : aucune permission pour son propre récapitulatif ; l'école est celle de la session. */
  @Get('moi/recapitulatif')
  @Authenticated()
  @ApiContract({
    summary: 'Mon récapitulatif mensuel d’assiduité PDF, tracé',
    query: z.object({ mois: MoisFeuille }),
    response: z.string(),
  })
  async mien(
    @Query('mois') mois: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const lu = MoisFeuille.safeParse(mois);
    if (!lu.success) throw new BadRequestException('Choisissez un mois au format AAAA-MM.');
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    const produit = await withOrganisation(this.db, access.organisationId, (tx) =>
      this.feuilles.monRecapitulatif(tx, access, lu.data, request.ip),
    );
    await envoyer(reply, produit);
  }
}
