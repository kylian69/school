import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { AttributionPersonne, ListeAttributions, NouvelleAttribution } from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { AttributionsService } from './attributions.service.js';

/** Rôles et périmètres d'une personne (US-01-09). */
@Controller('api')
export class AttributionsController {
  constructor(private readonly attributions: AttributionsService) {}

  @Get('personnes/:id/attributions')
  @RequirePermission(['personnes:lire', 'roles:attribuer'])
  @ApiContract({
    summary: 'Rôles d’une personne, avec périmètre et période',
    response: ListeAttributions,
  })
  lister(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributions.lister(RequestContext.tx(), RequestContext.access(), id);
  }

  @Post('personnes/:id/attributions')
  @RequirePermission('roles:attribuer')
  @ApiContract({
    summary: 'Attribuer un rôle avec un périmètre (RG-01-12 pour l’administrateur)',
    body: NouvelleAttribution,
    response: AttributionPersonne,
  })
  attribuer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: NouvelleAttribution,
    @Req() request: ScolalyRequest,
  ) {
    return this.attributions.attribuer(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      entree,
      request.ip,
    );
  }

  @Post('attributions/:id/retrait')
  @HttpCode(204)
  @RequirePermission('roles:attribuer')
  @ApiContract({
    summary: 'Retirer un rôle (jamais au dernier administrateur)',
    response: z.null(),
  })
  async retirer(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.attributions.retirer(RequestContext.tx(), RequestContext.access(), id, request.ip);
  }
}
