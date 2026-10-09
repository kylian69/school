import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  IMPORT_TAILLE_MAX,
  ListeCorrespondancesEdt,
  ParametresImportEdt,
  ResultatImportEdt,
  SaisieCorrespondancesEdt,
  TYPE_FICHIER_ICAL,
} from '@scolaly/contracts';
import { lireIcal, lireImportEdt } from '@scolaly/domain';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { decoderTexte, formatTableur, lireTableau } from '../../shared/tableur.js';
import { ImportEdtService } from './import.service.js';
import { SeancesService } from './seances.service.js';

const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

const invalide = (message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`fichier : ${message}`],
  });

/**
 * Import de l'emploi du temps (E-04-03, I4.2) : fichier CSV, Excel ou iCal envoyé tel quel
 * (10 Mo au plus), jamais conservé ni journalisé ; correspondances des libellés mémorisées.
 */
@Controller('api/edt/import')
export class ImportEdtController {
  constructor(
    private readonly imports: ImportEdtService,
    private readonly seances: SeancesService,
  ) {}

  @Post()
  @HttpCode(200)
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary:
      'Importer un emploi du temps (corps text/csv, .xlsx ou text/calendar) : aperçu sans écriture, puis import (RG-04-08 à RG-04-12)',
    query: ParametresImportEdt,
    response: ResultatImportEdt,
  })
  async importer(@Query() parametres: ParametresImportEdt, @Req() request: ScolalyRequest) {
    const [tx] = ctx();
    const contenu = request.body;
    const type = (request.headers['content-type'] ?? '').split(';')[0]?.trim();
    const format = type === TYPE_FICHIER_ICAL ? 'ics' : formatTableur(type);
    if (!format || !Buffer.isBuffer(contenu))
      throw invalide('Déposez un fichier CSV, Excel (.xlsx) ou iCal (.ics).');
    if (contenu.length > IMPORT_TAILLE_MAX)
      throw invalide('Le fichier dépasse 10 Mo. Découpez-le par période.');
    const campus = await this.seances.etablissement(tx, parametres.etablissementId);
    const lecture =
      format === 'ics'
        ? lireIcal(decoderTexte(contenu), campus.fuseauHoraire)
        : lireImportEdt(await lireTableau(contenu, format), campus.fuseauHoraire);
    return this.imports.importer(...ctx(), parametres, format, lecture, request.ip);
  }

  @Get('correspondances')
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Correspondances mémorisées entre libellés importés et objets (RG-04-09)',
    response: ListeCorrespondancesEdt,
  })
  correspondances() {
    return this.imports.correspondances(RequestContext.tx());
  }

  @Put('correspondances')
  @RequirePermission('edt:gerer', 'promotion')
  @ApiContract({
    summary: 'Mémoriser des correspondances de libellés importés (RG-04-09)',
    body: SaisieCorrespondancesEdt,
    response: ListeCorrespondancesEdt,
  })
  enregistrer(@Body() saisie: SaisieCorrespondancesEdt, @Req() request: ScolalyRequest) {
    return this.imports.enregistrerCorrespondances(...ctx(), saisie, request.ip);
  }
}
