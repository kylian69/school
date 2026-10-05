import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ActivationCompte,
  InvitationEnvoyee,
  InvitationPublique,
  ResultatActivation,
} from '@scolaly/contracts';
import type { Redis } from 'ioredis';
import { Public, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { limiterDebit } from '../../shared/limiteur.js';
import { VALKEY } from '../../shared/tokens.js';
import { InvitationsService } from './invitations.service.js';

/** Invitations envoyées par l'école (US-01-06, RG-01-08). */
@Controller('api/comptes')
export class ComptesController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post(':personneId/invitation')
  @HttpCode(200)
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Envoyer ou renvoyer l’invitation d’une personne',
    response: InvitationEnvoyee,
  })
  async inviter(
    @Param('personneId', ParseUUIDPipe) personneId: string,
    @Req() request: ScolalyRequest,
  ) {
    const access = RequestContext.access();
    const { expireLe, envoyer } = await this.invitations.inviter(
      RequestContext.tx(),
      access.organisationId,
      personneId,
      {
        userId: access.userId,
        adresseIp: request.ip,
      },
    );
    RequestContext.apresValidation(envoyer);
    return { etat: 'invite' as const, expireLe: expireLe.toISOString() };
  }
}

/** Parcours d'activation, sans session : le lien reçu par email fait foi. */
@Controller('api/invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  @Get(':jeton')
  @Public()
  @ApiContract({ summary: 'Consulter une invitation', response: InvitationPublique })
  async consulter(@Param('jeton') jeton: string, @Req() request: ScolalyRequest) {
    await limiterDebit(this.valkey, `invitation:${request.ip}`, 30, 60);
    return this.invitations.consulter(jeton);
  }

  @Post(':jeton/activation')
  @HttpCode(200)
  @Public()
  @ApiContract({
    summary: 'Activer son compte',
    body: ActivationCompte,
    response: ResultatActivation,
  })
  async activer(
    @Param('jeton') jeton: string,
    @Body() entree: ActivationCompte,
    @Req() request: ScolalyRequest,
  ) {
    await limiterDebit(this.valkey, `activation:${request.ip}`, 10, 60);
    return this.invitations.activer(jeton, entree, request.ip);
  }
}
