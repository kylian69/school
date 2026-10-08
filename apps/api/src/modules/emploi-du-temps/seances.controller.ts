import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  AnnulationSeance,
  ApercuSerie,
  ModificationSeance,
  PublicationSeances,
  RechercheSemaine,
  ResultatSeances,
  ResultatVerification,
  SaisieSeance,
  SaisieSerie,
  Seance,
  SemaineEdt,
  SerieCreee,
  VerificationSeance,
} from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { SeancesService } from './seances.service.js';

const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/**
 * Emploi du temps (module 04, I4.1) : séances et séries en brouillon, conflits, publication.
 * Périmètre : les promotions du public de chaque séance (formation ou établissement).
 */
@Controller('api/edt')
export class SeancesController {
  constructor(private readonly seances: SeancesService) {}

  @Get('semaine')
  @RequirePermission(['edt:lire', 'edt:gerer'], 'promotion')
  @ApiContract({
    summary: 'Séances d’une semaine de l’établissement, brouillons et conflits compris',
    query: RechercheSemaine,
    response: SemaineEdt,
  })
  semaine(@Query() recherche: RechercheSemaine) {
    return this.seances.semaine(...ctx(), recherche);
  }

  @Post('verification')
  @HttpCode(200)
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Conflits d’une séance envisagée, salles et créneaux libres (RG-04-05, RG-04-07)',
    body: VerificationSeance,
    response: ResultatVerification,
  })
  verifier(@Body() verification: VerificationSeance) {
    return this.seances.verifier(...ctx(), verification);
  }

  @Post('seances')
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Placer une séance, en brouillon (US-04-01, RG-04-01)',
    body: SaisieSeance,
    response: Seance,
  })
  creer(@Body() saisie: SaisieSeance, @Req() request: ScolalyRequest) {
    return this.seances.creer(...ctx(), saisie, request.ip);
  }

  @Patch('seances/:id')
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier une séance, les suivantes ou toute la série (RG-04-03)',
    body: ModificationSeance,
    response: ResultatSeances,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() modification: ModificationSeance,
    @Req() request: ScolalyRequest,
  ) {
    return this.seances.modifier(...ctx(), id, modification, request.ip);
  }

  @Post('seances/:id/annulation')
  @HttpCode(200)
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Annuler une séance avec un motif ; ses données sont conservées (RG-04-04)',
    body: AnnulationSeance,
    response: ResultatSeances,
  })
  annuler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() annulation: AnnulationSeance,
    @Req() request: ScolalyRequest,
  ) {
    return this.seances.annuler(...ctx(), id, annulation, request.ip);
  }

  @Post('publication')
  @HttpCode(200)
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Publier des séances, sans conflit bloquant non forcé (RG-04-06, RG-04-13)',
    body: PublicationSeances,
    response: ResultatSeances,
  })
  publier(@Body() publication: PublicationSeances, @Req() request: ScolalyRequest) {
    return this.seances.publier(...ctx(), publication, request.ip);
  }

  @Post('series/apercu')
  @HttpCode(200)
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Occurrences d’une série et jours sautés, avant création (RG-04-03)',
    body: SaisieSerie,
    response: ApercuSerie,
  })
  apercuSerie(@Body() saisie: SaisieSerie) {
    return this.seances.apercuSerie(...ctx(), saisie);
  }

  @Post('series')
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Créer une série de séances, en brouillon (US-04-02, RG-04-03)',
    body: SaisieSerie,
    response: SerieCreee,
  })
  creerSerie(@Body() saisie: SaisieSerie, @Req() request: ScolalyRequest) {
    return this.seances.creerSerie(...ctx(), saisie, request.ip);
  }
}
