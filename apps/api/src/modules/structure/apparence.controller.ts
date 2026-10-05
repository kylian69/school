import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApparenceEcole, ModificationApparence } from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { ApparenceService } from './apparence.service.js';

/** Apparence de l'école active (E-01-09) et logo public des écoles. */
@Controller('api')
export class ApparenceController {
  constructor(
    private readonly apparence: ApparenceService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get('apparence')
  @RequirePermission('apparence:gerer')
  @ApiContract({
    summary: 'Apparence de l’école (nom affiché, couleur, logo)',
    response: ApparenceEcole,
  })
  lire() {
    return this.apparence.lire(RequestContext.tx(), RequestContext.access().organisationId);
  }

  @Patch('apparence')
  @RequirePermission('apparence:gerer')
  @ApiContract({
    summary: 'Modifier le nom affiché ou la couleur principale (contraste contrôlé)',
    body: ModificationApparence,
    response: ApparenceEcole,
  })
  modifier(@Body() changement: ModificationApparence, @Req() request: ScolalyRequest) {
    return this.apparence.modifier(
      RequestContext.tx(),
      RequestContext.access(),
      changement,
      request.ip,
    );
  }

  @Put('apparence/logo')
  @RequirePermission('apparence:gerer')
  @ApiContract({
    summary: 'Déposer le logo : corps image/png ou image/svg+xml, 2 Mo au plus',
    response: ApparenceEcole,
  })
  deposerLogo(@Req() request: ScolalyRequest) {
    return this.apparence.deposerLogo(
      RequestContext.tx(),
      RequestContext.access(),
      request.body as Buffer | undefined,
      request.headers['content-type'],
      request.ip,
    );
  }

  @Delete('apparence/logo')
  @RequirePermission('apparence:gerer')
  @ApiContract({ summary: 'Retirer le logo', response: ApparenceEcole })
  retirerLogo(@Req() request: ScolalyRequest) {
    return this.apparence.retirerLogo(RequestContext.tx(), RequestContext.access(), request.ip);
  }

  /**
   * Logo d'une école, public comme toute marque (interface, emails). Servi par l'API pour rester
   * sur l'origine de l'application ; la politique de contenu de l'API (default-src 'none',
   * sandbox) neutralise un SVG ouvert directement.
   */
  @Get('ecoles/:id/logo')
  @Public()
  @ApiContract({
    summary: 'Logo public d’une école (PNG ou SVG)',
    query: z.object({ v: z.string().max(64).optional() }),
    response: z.string(),
  })
  async logo(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('v') version: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const logo = await withOrganisation(this.db, id, (tx) => this.apparence.logo(tx, id));
    if (!logo) throw new NotFoundException('Cette école n’a pas de logo.');
    const versionCourante = version !== undefined && logo.empreinte.startsWith(version);
    await reply
      .header('content-type', logo.type)
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .header('x-content-type-options', 'nosniff')
      .header('cross-origin-resource-policy', 'cross-origin')
      .header(
        'cache-control',
        versionCourante ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      )
      .send(logo.contenu);
  }
}
