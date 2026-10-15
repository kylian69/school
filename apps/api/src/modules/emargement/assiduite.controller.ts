import { Controller, ForbiddenException, Get, Inject, Query, Req } from '@nestjs/common';
import { FiltreAssiduite, MesAbsences, SuiviAssiduite } from '@scolaly/contracts';
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
}
