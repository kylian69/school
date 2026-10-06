import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import {
  ActionsPersonnes,
  ExportDiffere,
  RecherchePersonnes,
  ResultatActions,
} from '@scolaly/contracts';
import type { FastifyReply } from 'fastify';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { ActionsService } from './actions.service.js';

/** Actions en masse et export depuis la liste des personnes (E-01-04). */
@Controller('api/personnes')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post('actions')
  @HttpCode(200)
  @RequirePermission(['apprenants:inviter', 'personnel:inviter', 'comptes:desactiver'])
  @ApiContract({
    summary: 'Inviter, relancer, désactiver ou réactiver plusieurs personnes',
    body: ActionsPersonnes,
    response: ResultatActions,
  })
  executer(@Body() actions: ActionsPersonnes, @Req() request: ScolalyRequest) {
    return this.actions.executer(RequestContext.tx(), RequestContext.access(), actions, request.ip);
  }

  @Get('export')
  @RequirePermission('personnes:exporter')
  @ApiContract({
    summary:
      'Exporter les personnes filtrées (CSV ; au-delà de 100, lien envoyé par email, RG-01-21)',
    query: RecherchePersonnes.pick({ q: true, role: true, etat: true }),
    response: ExportDiffere,
  })
  async exporter(
    @Query() recherche: Pick<RecherchePersonnes, 'q' | 'role' | 'etat'>,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const resultat = await this.actions.exporter(
      RequestContext.tx(),
      RequestContext.access(),
      recherche,
      request.ip,
    );
    // RG-01-21 : l'export n'est remis qu'une fois sa trace validée en base.
    if ('contenu' in resultat) {
      const { contenu } = resultat;
      RequestContext.apresValidation(async () => {
        await reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', 'attachment; filename="personnes.csv"')
          .send(contenu);
      });
      return;
    }
    const differe = {
      total: resultat.total,
      message: `L’export de ${String(resultat.total)} personnes vous est envoyé par email, avec un lien valable 24 heures.`,
    } satisfies ExportDiffere;
    RequestContext.apresValidation(async () => {
      await reply.status(202).send(differe);
    });
  }
}
