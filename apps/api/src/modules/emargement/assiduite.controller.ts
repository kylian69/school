import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  AlerteAssiduite,
  FiltreAssiduite,
  FiltreTableauAssiduite,
  MesAbsences,
  SuiviAssiduite,
  TableauAssiduite,
} from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import { ACCESS_RESOLVER, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { AssiduiteService } from './assiduite.service.js';
import { JustificatifsService } from './justificatifs.service.js';

/** Assiduité (I4.4) : retards et absences calculés à partir des appels validés. */
@Controller('api')
export class AssiduiteController {
  constructor(
    private readonly assiduite: AssiduiteService,
    private readonly justificatifs: JustificatifsService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** US-06-13 : aucune permission pour sa propre assiduité ; l'école est celle de la session. */
  @Get('moi/absences')
  @Authenticated()
  @ApiContract({ summary: 'Mes retards et absences, avec leur décompte', response: MesAbsences })
  async miennes(@Req() request: ScolalyRequest) {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    return withOrganisation(this.db, access.organisationId, async (tx) => ({
      ...(await this.assiduite.mesAbsences(tx, access)),
      justificatifs: await this.justificatifs.miens(tx, access),
      delaiHeures: await this.justificatifs.delaiHeures(tx, access),
    }));
  }

  /** E-06-07 : périmètre contrôlé par le service (promotions couvertes par la permission). */
  @Get('assiduite')
  @RequirePermission('assiduite:lire')
  @ApiContract({
    summary: 'Retards et absences des apprenants de mon périmètre, avec leur décompte',
    query: FiltreAssiduite,
    response: SuiviAssiduite,
  })
  suivi(@Query() filtre: FiltreAssiduite) {
    return this.assiduite.suivi(RequestContext.tx(), RequestContext.access(), filtre);
  }

  /** E-06-07, US-06-10 : périmètre contrôlé par le service, comme le suivi. */
  @Get('assiduite/tableau-de-bord')
  @RequirePermission('assiduite:lire')
  @ApiContract({
    summary: 'Tableau de bord de l’assiduité : indicateurs et apprenants au-dessus des seuils',
    query: FiltreTableauAssiduite,
    response: TableauAssiduite,
  })
  tableauDeBord(@Query() filtre: FiltreTableauAssiduite) {
    return this.assiduite.tableauDeBord(RequestContext.tx(), RequestContext.access(), filtre);
  }

  /** RG-06-23 : alerte d'un apprenant de mon périmètre marquée traitée. */
  @Post('assiduite/alertes/:id/traitement')
  @HttpCode(200)
  @RequirePermission('assiduite:alertes', 'promotion')
  @ApiContract({
    summary: 'Marquer une alerte d’assiduité comme traitée',
    response: AlerteAssiduite,
  })
  traiterAlerte(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.assiduite.traiterAlerte(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      request.ip,
    );
  }
}
