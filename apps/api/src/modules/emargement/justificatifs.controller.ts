import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  DecisionJustificatif,
  DepotJustificatif,
  FileJustificatifs,
  FiltreJustificatifs,
  Justificatif,
  JustificatifATraiter,
  LienDocument,
  NouveauJustificatif,
} from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { JustificatifsService } from './justificatifs.service.js';

const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/**
 * Justificatifs d'absence (I4.4 ; US-06-07, US-06-08, RG-06-19 à RG-06-21). L'apprenant dépose
 * pour lui-même sans permission ; la scolarité et la pédagogie traitent dans leur périmètre.
 */
@Controller('api')
export class JustificatifsController {
  constructor(
    private readonly justificatifs: JustificatifsService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Post('moi/justificatifs')
  @Authenticated()
  @ApiContract({
    summary: 'Déposer un justificatif pour mes retards ou absences (le document suit)',
    body: NouveauJustificatif,
    response: Justificatif,
  })
  async deposer(@Body() entree: NouveauJustificatif, @Req() request: ScolalyRequest) {
    const access = await this.moi(request);
    return withOrganisation(this.db, access.organisationId, (tx) =>
      this.justificatifs.creer(tx, access, access.personneId, entree, request.ip),
    );
  }

  @Put('moi/justificatifs/:id/document')
  @Authenticated()
  @ApiContract({
    summary: 'Joindre le document de mon justificatif (corps PDF, JPEG ou PNG, 10 Mo au plus)',
    response: Justificatif,
  })
  async documentMien(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    const access = await this.moi(request);
    return withOrganisation(this.db, access.organisationId, (tx) =>
      this.justificatifs.deposerDocument(
        tx,
        access,
        id,
        request.body as Buffer | undefined,
        request.ip,
        'apprenant',
      ),
    );
  }

  @Post('justificatifs')
  @RequirePermission('justificatifs:deposer', 'promotion')
  @ApiContract({
    summary: 'Déposer un justificatif pour un apprenant de mon périmètre (le document suit)',
    body: DepotJustificatif,
    response: Justificatif,
  })
  deposerPourApprenant(@Body() entree: DepotJustificatif, @Req() request: ScolalyRequest) {
    const { personneId, ...justificatif } = entree;
    return this.justificatifs.creerPourApprenant(...ctx(), personneId, justificatif, request.ip);
  }

  @Put('justificatifs/:id/document')
  @RequirePermission('justificatifs:deposer', 'promotion')
  @ApiContract({
    summary: 'Joindre le document d’un justificatif déposé pour un apprenant',
    response: Justificatif,
  })
  documentEcole(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.justificatifs.deposerDocument(
      ...ctx(),
      id,
      request.body as Buffer | undefined,
      request.ip,
      'ecole',
    );
  }

  @Get('justificatifs')
  @RequirePermission('justificatifs:traiter', 'promotion')
  @ApiContract({
    summary: 'File des justificatifs d’absence de mon périmètre',
    query: FiltreJustificatifs,
    response: FileJustificatifs,
  })
  file(@Query() filtre: FiltreJustificatifs) {
    return this.justificatifs.file(...ctx(), filtre);
  }

  @Get('justificatifs/:id/document')
  @RequirePermission('justificatifs:traiter', 'promotion')
  @ApiContract({ summary: 'Lien de téléchargement du document', response: LienDocument })
  document(@Param('id', ParseUUIDPipe) id: string) {
    return this.justificatifs.lienDocument(...ctx(), id);
  }

  @Post('justificatifs/:id/decision')
  @RequirePermission('justificatifs:traiter', 'promotion')
  @ApiContract({
    summary: 'Accepter, refuser ou demander un complément',
    body: DecisionJustificatif,
    response: JustificatifATraiter,
  })
  decider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: DecisionJustificatif,
    @Req() request: ScolalyRequest,
  ) {
    return this.justificatifs.decider(...ctx(), id, entree, request.ip);
  }

  private async moi(request: ScolalyRequest): Promise<Access> {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access)
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    return access;
  }
}
