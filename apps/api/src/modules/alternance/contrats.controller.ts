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
  Query,
  Req,
} from '@nestjs/common';
import {
  ChangementTuteur,
  Contrat,
  ConventionStage,
  LienDocument,
  ListeContrats,
  ModificationContrat,
  ModificationConvention,
  NouveauContrat,
  NouvelleConvention,
  RechercheContrats,
  RuptureContrat,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { ContratsService } from './contrats.service.js';

const LECTURE = ['contrats:lire', 'contrats:gerer'] as const;
const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Contrats d'alternance et conventions de stage (E-03-03, E-03-04). */
@Controller('api')
export class ContratsController {
  constructor(private readonly contrats: ContratsService) {}

  @Get('contrats')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({
    summary: 'Contrats et conventions de stage du périmètre (E-03-03)',
    query: RechercheContrats,
    response: ListeContrats,
  })
  lister(@Query() recherche: RechercheContrats) {
    return this.contrats.lister(...ctx(), recherche);
  }

  @Post('contrats')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Enregistrer le contrat d’un alternant (US-03-02)',
    body: NouveauContrat,
    response: Contrat,
  })
  creer(@Body() entree: NouveauContrat, @Req() request: ScolalyRequest) {
    return this.contrats.creer(...ctx(), entree, request.ip);
  }

  @Get('contrats/:id')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({ summary: 'Un contrat, ses tuteurs et ses avertissements', response: Contrat })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.contrats.lire(...ctx(), id);
  }

  @Patch('contrats/:id')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier un contrat ou changer son statut (RG-03-05, RG-03-06)',
    body: ModificationContrat,
    response: Contrat,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationContrat,
    @Req() request: ScolalyRequest,
  ) {
    return this.contrats.modifier(...ctx(), id, changement, request.ip);
  }

  @Delete('contrats/:id')
  @HttpCode(204)
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({ summary: 'Supprimer un contrat en brouillon', response: z.null() })
  async supprimer(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.contrats.supprimer(...ctx(), id, request.ip);
    return null;
  }

  @Post('contrats/:id/tuteurs')
  @HttpCode(200)
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Ajouter ou remplacer un tuteur à une date d’effet',
    body: ChangementTuteur,
    response: Contrat,
  })
  changerTuteur(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ChangementTuteur,
    @Req() request: ScolalyRequest,
  ) {
    return this.contrats.changerTuteur(...ctx(), id, changement, request.ip);
  }

  @Post('contrats/:id/rupture')
  @HttpCode(200)
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Enregistrer la rupture d’un contrat (US-03-12, RG-03-07)',
    body: RuptureContrat,
    response: Contrat,
  })
  rompre(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rupture: RuptureContrat,
    @Req() request: ScolalyRequest,
  ) {
    return this.contrats.rompre(...ctx(), id, rupture, request.ip);
  }

  @Put('contrats/:id/document')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Joindre le contrat signé (corps application/pdf, 10 Mo au plus)',
    response: Contrat,
  })
  async deposerContrat(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    const [tx, access] = ctx();
    await this.contrats.deposerDocument(
      tx,
      access,
      'contrat',
      id,
      request.body as Buffer | undefined,
      request.ip,
    );
    return this.contrats.lire(tx, access, id);
  }

  @Get('contrats/:id/document')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({ summary: 'Lien de téléchargement du contrat signé', response: LienDocument })
  documentContrat(@Param('id', ParseUUIDPipe) id: string) {
    return this.contrats.lienDocument(...ctx(), 'contrat', id);
  }

  @Post('conventions-stage')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Enregistrer une convention de stage, avec ses contrôles légaux (US-03-15)',
    body: NouvelleConvention,
    response: ConventionStage,
  })
  creerConvention(@Body() entree: NouvelleConvention, @Req() request: ScolalyRequest) {
    return this.contrats.creerConvention(...ctx(), entree, request.ip);
  }

  @Get('conventions-stage/:id')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({ summary: 'Une convention de stage et ses contrôles', response: ConventionStage })
  lireConvention(@Param('id', ParseUUIDPipe) id: string) {
    return this.contrats.lireConvention(...ctx(), id);
  }

  @Patch('conventions-stage/:id')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier une convention de stage ou changer son statut',
    body: ModificationConvention,
    response: ConventionStage,
  })
  modifierConvention(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationConvention,
    @Req() request: ScolalyRequest,
  ) {
    return this.contrats.modifierConvention(...ctx(), id, changement, request.ip);
  }

  @Put('conventions-stage/:id/document')
  @RequirePermission('contrats:gerer', 'promotion')
  @ApiContract({
    summary: 'Joindre la convention signée (corps application/pdf, 10 Mo au plus)',
    response: ConventionStage,
  })
  async deposerConvention(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    const [tx, access] = ctx();
    await this.contrats.deposerDocument(
      tx,
      access,
      'convention',
      id,
      request.body as Buffer | undefined,
      request.ip,
    );
    return this.contrats.lireConvention(tx, access, id);
  }

  @Get('conventions-stage/:id/document')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({
    summary: 'Lien de téléchargement de la convention signée',
    response: LienDocument,
  })
  documentConvention(@Param('id', ParseUUIDPipe) id: string) {
    return this.contrats.lienDocument(...ctx(), 'convention', id);
  }
}
