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
  CalendrierAnnee,
  Fermeture,
  ListeAnnees,
  ModificationAnnee,
  NouvelleAnnee,
  SaisieFermeture,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { CalendrierService } from './calendrier.service.js';

/** Calendrier de l'école active : années, périodes, fermetures et jours fériés (E-01-03). */
@Controller('api')
export class CalendrierController {
  constructor(private readonly calendrier: CalendrierService) {}

  @Get('annees')
  @RequirePermission(['calendrier:lire', 'calendrier:gerer'])
  @ApiContract({ summary: 'Années scolaires de l’école et leurs périodes', response: ListeAnnees })
  lister() {
    return this.calendrier.lister(RequestContext.tx());
  }

  @Get('annees/:id')
  @RequirePermission(['calendrier:lire', 'calendrier:gerer'])
  @ApiContract({
    summary: 'Calendrier d’une année : périodes, fermetures et jours fériés',
    response: CalendrierAnnee,
  })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.calendrier.lire(RequestContext.tx(), id);
  }

  @Post('annees')
  @RequirePermission('calendrier:gerer')
  @ApiContract({
    summary: 'Créer une année scolaire et ses périodes',
    body: NouvelleAnnee,
    response: CalendrierAnnee,
  })
  creer(@Body() entree: NouvelleAnnee, @Req() request: ScolalyRequest) {
    return this.calendrier.creer(RequestContext.tx(), RequestContext.access(), entree, request.ip);
  }

  @Patch('annees/:id')
  @RequirePermission('calendrier:gerer')
  @ApiContract({
    summary: 'Modifier une année (dates, statut, périodes)',
    body: ModificationAnnee,
    response: CalendrierAnnee,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationAnnee,
    @Req() request: ScolalyRequest,
  ) {
    return this.calendrier.modifier(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      changement,
      request.ip,
    );
  }

  @Delete('annees/:id')
  @HttpCode(204)
  @RequirePermission('calendrier:gerer')
  @ApiContract({ summary: 'Supprimer une année en préparation', response: z.null() })
  async supprimer(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.calendrier.supprimer(RequestContext.tx(), RequestContext.access(), id, request.ip);
  }

  @Post('annees/:id/fermetures')
  @RequirePermission('calendrier:gerer')
  @ApiContract({
    summary: 'Ajouter une fermeture (vacances, pont, férié local)',
    body: SaisieFermeture,
    response: Fermeture,
  })
  ajouterFermeture(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieFermeture,
    @Req() request: ScolalyRequest,
  ) {
    return this.calendrier.ajouterFermeture(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      saisie,
      request.ip,
    );
  }

  @Put('fermetures/:id')
  @RequirePermission('calendrier:gerer')
  @ApiContract({ summary: 'Modifier une fermeture', body: SaisieFermeture, response: Fermeture })
  modifierFermeture(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieFermeture,
    @Req() request: ScolalyRequest,
  ) {
    return this.calendrier.modifierFermeture(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      saisie,
      request.ip,
    );
  }

  @Delete('fermetures/:id')
  @HttpCode(204)
  @RequirePermission('calendrier:gerer')
  @ApiContract({ summary: 'Supprimer une fermeture', response: z.null() })
  async supprimerFermeture(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.calendrier.supprimerFermeture(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      request.ip,
    );
  }
}
