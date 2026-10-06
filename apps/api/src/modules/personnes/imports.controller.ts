import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApercuImport, ModificationCorrespondance, NouvelImport } from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { ImportsService } from './imports.service.js';

/** Assistant d'import des personnes (E-01-06 ; US-01-05, RG-01-17, RG-01-18). */
@Controller('api/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

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
}
