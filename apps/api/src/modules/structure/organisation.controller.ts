import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  Etablissement,
  ModificationEtablissement,
  ModificationOrganisation,
  NouvelEtablissement,
  OrganisationDetail,
} from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { OrganisationService } from './organisation.service.js';

/** Organisation et établissements de l'école active (E-01-02). */
@Controller('api')
export class OrganisationController {
  constructor(private readonly organisation: OrganisationService) {}

  @Get('organisation')
  @RequirePermission('organisation:lire')
  @ApiContract({
    summary: 'Organisation et établissements de l’école',
    response: OrganisationDetail,
  })
  lire() {
    return this.organisation.lire(RequestContext.tx(), RequestContext.access());
  }

  @Patch('organisation')
  @RequirePermission('organisation:modifier')
  @ApiContract({
    summary: 'Modifier le nom, le nom affiché ou le SIREN de l’école',
    body: ModificationOrganisation,
    response: OrganisationDetail,
  })
  modifier(@Body() changement: ModificationOrganisation, @Req() request: ScolalyRequest) {
    return this.organisation.modifier(
      RequestContext.tx(),
      RequestContext.access(),
      changement,
      request.ip,
    );
  }

  @Post('etablissements')
  @RequirePermission('organisation:modifier')
  @ApiContract({
    summary: 'Créer un établissement',
    body: NouvelEtablissement,
    response: Etablissement,
  })
  creer(@Body() entree: NouvelEtablissement, @Req() request: ScolalyRequest) {
    return this.organisation.creerEtablissement(
      RequestContext.tx(),
      RequestContext.access(),
      entree,
      request.ip,
    );
  }

  @Patch('etablissements/:id')
  @RequirePermission('organisation:modifier')
  @ApiContract({
    summary: 'Modifier un établissement',
    body: ModificationEtablissement,
    response: Etablissement,
  })
  modifierEtablissement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationEtablissement,
    @Req() request: ScolalyRequest,
  ) {
    return this.organisation.modifierEtablissement(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      changement,
      request.ip,
    );
  }

  @Post('etablissements/:id/archivage')
  @HttpCode(200)
  @RequirePermission('organisation:modifier')
  @ApiContract({ summary: 'Archiver un établissement (RG-01-01)', response: Etablissement })
  archiver(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.organisation.changerStatut(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      'archive',
      request.ip,
    );
  }

  @Post('etablissements/:id/reactivation')
  @HttpCode(200)
  @RequirePermission('organisation:modifier')
  @ApiContract({ summary: 'Réactiver un établissement archivé', response: Etablissement })
  reactiver(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.organisation.changerStatut(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      'actif',
      request.ip,
    );
  }
}
