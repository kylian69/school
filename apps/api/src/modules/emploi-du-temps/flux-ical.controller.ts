import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { FluxIcal } from '@scolaly/contracts';
import { lireJeton, withOrganisation, type Database, type Transaction } from '@scolaly/db';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, Public } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { limiterDebit } from '../../shared/limiteur.js';
import { DATABASE, VALKEY } from '../../shared/tokens.js';
import { FluxIcalService, verifierAccesFlux } from './flux-ical.service.js';

/** Lectures d'un même flux : un agenda relit au plus toutes les 15 minutes. */
const LECTURES_PAR_FLUX = 30;
const FENETRE_FLUX_SECONDES = 15 * 60;
/** Lectures par adresse IP (les agendas en ligne partagent leurs adresses : limite large). */
const LECTURES_PAR_IP = 300;

/**
 * Flux iCal personnel (RG-04-15, US-04-09). Route publique sans session : le jeton secret
 * désigne l'école (transaction RLS) et la personne ; rien d'autre n'est lisible avec lui.
 */
@Controller('api/agenda')
export class FluxIcalPublicController {
  constructor(
    private readonly flux: FluxIcalService,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  @Get(':fichier')
  @Public()
  @ApiContract({
    summary: 'Flux iCal personnel (adresse secrète d’abonnement)',
    response: z.string(),
  })
  async lire(
    @Param('fichier') fichier: string,
    @Headers('if-none-match') etagConnu: string | undefined,
    @Req() request: ScolalyRequest,
    @Res() reply: FastifyReply,
  ) {
    await limiterDebit(this.valkey, `agenda-ip:${request.ip}`, LECTURES_PAR_IP, 60);
    const lu = lireJeton(fichier.replace(/\.ics$/, ''));
    if (lu) {
      await limiterDebit(
        this.valkey,
        `agenda:${lu.empreinte}`,
        LECTURES_PAR_FLUX,
        FENETRE_FLUX_SECONDES,
      );
    }
    const { contenu, etag } = await this.flux.lire(fichier);
    reply
      .header('etag', etag)
      // Moins de 15 minutes entre une publication et l'agenda (RG-04-15).
      .header('cache-control', 'private, max-age=300')
      .header('referrer-policy', 'no-referrer')
      .header('x-robots-tag', 'noindex, nofollow')
      .header('x-content-type-options', 'nosniff');
    if (etagConnu?.split(',').some((e) => e.trim() === etag)) {
      await reply.status(304).send();
      return;
    }
    await reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'inline; filename="emploi-du-temps.ics"')
      .send(contenu);
  }
}

/** Écran « Mes connexions » (E-18-07) : l'adresse de son propre flux, sans permission. */
@Controller('api/moi/agenda')
export class FluxIcalController {
  constructor(
    private readonly flux: FluxIcalService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get()
  @Authenticated()
  @ApiContract({ summary: 'État de mon flux iCal', response: FluxIcal })
  etat(@Req() request: ScolalyRequest) {
    return this.dansMonEcole(request, false, (tx, access) => this.flux.etat(tx, access));
  }

  @Post()
  @Authenticated()
  @ApiContract({
    summary: 'Créer ou régénérer mon flux iCal (l’adresse précédente cesse de répondre)',
    response: FluxIcal,
  })
  regenerer(@Req() request: ScolalyRequest) {
    return this.dansMonEcole(request, true, (tx, access) =>
      this.flux.regenerer(tx, access, request.ip),
    );
  }

  /** La révocation reste possible même quand l'école est en lecture seule. */
  @Delete()
  @Authenticated()
  @ApiContract({ summary: 'Révoquer mon flux iCal', response: FluxIcal })
  revoquer(@Req() request: ScolalyRequest) {
    return this.dansMonEcole(request, false, (tx, access) =>
      this.flux.revoquer(tx, access, request.ip),
    );
  }

  private async dansMonEcole<T>(
    request: ScolalyRequest,
    ecriture: boolean,
    traitement: (tx: Transaction, access: Access) => Promise<T>,
  ): Promise<T> {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    verifierAccesFlux(access, ecriture);
    return withOrganisation(this.db, access.organisationId, (tx) => traitement(tx, access));
  }
}
