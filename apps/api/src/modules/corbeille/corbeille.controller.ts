import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Corbeille, TYPES_CORBEILLE, type TypeCorbeille } from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { CorbeilleService } from './corbeille.service.js';

const TYPES = Object.fromEntries(TYPES_CORBEILLE.map((t) => [t, t]));

/** Corbeille de l'école active (E-01-10). */
@Controller('api/corbeille')
export class CorbeilleController {
  constructor(private readonly corbeille: CorbeilleService) {}

  @Get()
  @RequirePermission('corbeille:restaurer')
  @ApiContract({
    summary: 'Éléments supprimés depuis moins de 30 jours (ses suppressions hors périmètre école)',
    response: Corbeille,
  })
  lister() {
    return this.corbeille.lister(RequestContext.tx(), RequestContext.access());
  }

  @Post(':type/:id/restauration')
  @HttpCode(204)
  @RequirePermission('corbeille:restaurer')
  @ApiContract({
    summary: 'Restaurer un élément et ce qui a été supprimé avec lui (RG-01-23)',
    response: z.null(),
  })
  async restaurer(
    @Param('type', new ParseEnumPipe(TYPES)) type: TypeCorbeille,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    await this.corbeille.restaurer(
      RequestContext.tx(),
      RequestContext.access(),
      type,
      id,
      request.ip,
    );
  }
}
