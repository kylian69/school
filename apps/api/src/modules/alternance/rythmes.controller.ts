import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  CalendrierPromotion,
  GenerationCalendrier,
  ListeModelesRythme,
  ModeleRythme,
  ModificationModeleRythme,
  NouveauModeleRythme,
  NouvelleExceptionRythme,
  RetoucheJours,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { RythmesService } from './rythmes.service.js';

const LECTURE = ['rythmes:lire', 'rythmes:gerer'] as const;
const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Rythmes d'alternance : modèles, calendriers des promotions, exceptions (E-03-05). */
@Controller('api')
export class RythmesController {
  constructor(private readonly rythmes: RythmesService) {}

  @Get('rythmes/modeles')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({
    summary: 'Modèles de rythme : les 5 fournis et ceux de l’école (RG-03-10)',
    response: ListeModelesRythme,
  })
  modeles() {
    return this.rythmes.listerModeles(...ctx());
  }

  @Post('rythmes/modeles')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Créer un modèle de rythme',
    body: NouveauModeleRythme,
    response: ModeleRythme,
  })
  creerModele(@Body() entree: NouveauModeleRythme, @Req() request: ScolalyRequest) {
    return this.rythmes.creerModele(...ctx(), entree, request.ip);
  }

  @Patch('rythmes/modeles/:id')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier un modèle de l’école (les calendriers générés ne changent pas)',
    body: ModificationModeleRythme,
    response: ModeleRythme,
  })
  modifierModele(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationModeleRythme,
    @Req() request: ScolalyRequest,
  ) {
    return this.rythmes.modifierModele(...ctx(), id, changement, request.ip);
  }

  @Delete('rythmes/modeles/:id')
  @HttpCode(204)
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({ summary: 'Supprimer un modèle de l’école', response: z.null() })
  async supprimerModele(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.rythmes.supprimerModele(...ctx(), id, request.ip);
    return null;
  }

  @Get('promotions/:id/rythme')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({
    summary: 'Calendrier d’alternance d’une promotion et exceptions individuelles',
    response: CalendrierPromotion,
  })
  calendrier(@Param('id', ParseUUIDPipe) id: string) {
    return this.rythmes.calendrier(...ctx(), id);
  }

  @Put('promotions/:id/rythme')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Générer le calendrier d’après un modèle, fériés et fermetures appliqués (RG-03-11)',
    body: GenerationCalendrier,
    response: CalendrierPromotion,
  })
  generer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() generation: GenerationCalendrier,
    @Req() request: ScolalyRequest,
  ) {
    return this.rythmes.generer(...ctx(), id, generation, request.ip);
  }

  @Patch('promotions/:id/rythme/jours')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Retoucher des jours du calendrier annuel',
    body: RetoucheJours,
    response: CalendrierPromotion,
  })
  retoucher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() retouche: RetoucheJours,
    @Req() request: ScolalyRequest,
  ) {
    return this.rythmes.retoucher(...ctx(), id, retouche, request.ip);
  }

  @Post('promotions/:id/rythme/exceptions')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Exception de rythme d’un apprenant (RG-03-12)',
    body: NouvelleExceptionRythme,
    response: CalendrierPromotion,
  })
  creerException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: NouvelleExceptionRythme,
    @Req() request: ScolalyRequest,
  ) {
    return this.rythmes.creerException(...ctx(), id, entree, request.ip);
  }

  @Patch('exceptions-rythme/:id/jours')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({
    summary: 'Retoucher des jours d’une exception',
    body: RetoucheJours,
    response: CalendrierPromotion,
  })
  retoucherException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() retouche: RetoucheJours,
    @Req() request: ScolalyRequest,
  ) {
    return this.rythmes.retoucherException(...ctx(), id, retouche, request.ip);
  }

  @Delete('exceptions-rythme/:id')
  @RequirePermission('rythmes:gerer', 'promotion')
  @ApiContract({ summary: 'Supprimer une exception de rythme', response: CalendrierPromotion })
  supprimerException(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.rythmes.supprimerException(...ctx(), id, request.ip);
  }
}
