import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApercuImport,
  ModificationCorrespondance,
  NouvelImport,
  ValidationImport,
} from '@scolaly/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { ImportsService, libelleMotif } from './imports.service.js';
import { ValidationImportService } from './validation-import.service.js';

/** Assistant d'import des personnes (E-01-06 ; US-01-05, RG-01-17, RG-01-18). */
@Controller('api/imports')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly validation: ValidationImportService,
  ) {}

  @Post()
  @RequirePermission('personnes:importer')
  @ApiContract({
    summary: 'Déposer un fichier CSV ou Excel (corps text/csv ou .xlsx, 10 Mo au plus)',
    query: NouvelImport,
    response: ApercuImport,
  })
  creer(@Query() entree: NouvelImport, @Req() request: ScolalyRequest) {
    return this.imports.creer(
      RequestContext.tx(),
      RequestContext.access(),
      entree,
      request.body as Buffer | undefined,
      request.headers['content-type'],
    );
  }

  @Get(':id')
  @RequirePermission('personnes:importer')
  @ApiContract({
    summary: 'Reprendre un import : correspondance et aperçu',
    response: ApercuImport,
  })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.imports.lire(RequestContext.tx(), id);
  }

  @Put(':id/correspondance')
  @RequirePermission('personnes:importer')
  @ApiContract({
    summary: 'Associer les colonnes du fichier aux champs des fiches',
    body: ModificationCorrespondance,
    response: ApercuImport,
  })
  modifierCorrespondance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationCorrespondance,
  ) {
    return this.imports.modifierCorrespondance(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      changement,
    );
  }

  @Post(':id/validation')
  @HttpCode(200)
  @RequirePermission('personnes:importer')
  @ApiContract({
    summary: 'Valider l’import : tout ou rien, ou les seules lignes valides (RG-01-19)',
    body: ValidationImport,
    response: ApercuImport,
  })
  valider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() choix: ValidationImport,
    @Req() request: ScolalyRequest,
  ) {
    return this.validation.valider(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      choix,
      request.ip,
    );
  }

  @Post(':id/annulation')
  @HttpCode(200)
  @RequirePermission('personnes:importer')
  @ApiContract({
    summary: 'Annuler un import dans les 24 h, s’il n’a pas servi (RG-01-20)',
    response: ApercuImport,
  })
  annuler(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.validation.annuler(RequestContext.tx(), RequestContext.access(), id, request.ip);
  }

  @Get(':id/rapport')
  @RequirePermission('personnes:importer')
  @ApiContract({ summary: 'Rapport CSV des lignes rejetées (RG-01-19)', response: z.string() })
  async rapport(@Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    const { nom, contenu } = await this.validation.rapportCsv(
      RequestContext.tx(),
      id,
      libelleMotif,
    );
    await reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nom)}`)
      .send(contenu);
  }
}
