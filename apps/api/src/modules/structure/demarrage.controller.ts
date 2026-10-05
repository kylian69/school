import { Body, Controller, Get, Param, ParseEnumPipe, Put, Req } from '@nestjs/common';
import {
  ChoixEtapeDemarrage,
  Demarrage,
  ETAPES_DEMARRAGE,
  type EtapeDemarrage,
} from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DemarrageService } from './demarrage.service.js';

const ETAPES = Object.fromEntries(ETAPES_DEMARRAGE.map((e) => [e, e]));

/** Liste de démarrage de l'école active (E-01-01), réservée à son administration. */
@Controller('api/demarrage')
export class DemarrageController {
  constructor(private readonly demarrage: DemarrageService) {}

  @Get()
  @RequirePermission('organisation:modifier')
  @ApiContract({ summary: 'Étapes de configuration de l’école et avancement', response: Demarrage })
  lire() {
    return this.demarrage.lire(RequestContext.tx(), RequestContext.access());
  }

  @Put('etapes/:etape')
  @RequirePermission('organisation:modifier')
  @ApiContract({
    summary: 'Marquer une étape faite ou passée, ou la reprendre',
    body: ChoixEtapeDemarrage,
    response: Demarrage,
  })
  choisir(
    @Param('etape', new ParseEnumPipe(ETAPES)) etape: EtapeDemarrage,
    @Body() choix: ChoixEtapeDemarrage,
    @Req() request: ScolalyRequest,
  ) {
    return this.demarrage.choisir(
      RequestContext.tx(),
      RequestContext.access(),
      etape,
      choix,
      request.ip,
    );
  }
}
