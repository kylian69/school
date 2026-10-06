import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { JournalAudit, RechercheJournal } from '@scolaly/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { AuditService } from './audit.service.js';

/** Journal d'audit de l'école active (E-01-08), en lecture seule. */
@Controller('api/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:lire')
  @ApiContract({
    summary:
      'Journal d’audit filtré (auteur, action, objet, période), du plus récent au plus ancien',
    query: RechercheJournal,
    response: JournalAudit,
  })
  lister(@Query() recherche: RechercheJournal) {
    return this.audit.lister(RequestContext.tx(), recherche);
  }

  @Get('export')
  @RequirePermission('audit:lire')
  @ApiContract({
    summary: 'Export CSV du journal filtré (10 000 événements au plus), tracé',
    query: RechercheJournal.omit({ curseur: true, parPage: true }),
    response: z.string(),
  })
  async exporter(
    @Query() recherche: Omit<RechercheJournal, 'curseur' | 'parPage'>,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    const contenu = await this.audit.exporter(
      RequestContext.tx(),
      RequestContext.access(),
      recherche,
      request.ip,
    );
    // L'export n'est remis qu'une fois sa trace validée en base.
    RequestContext.apresValidation(async () => {
      await reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="journal-audit.csv"')
        .send(contenu);
    });
  }
}
