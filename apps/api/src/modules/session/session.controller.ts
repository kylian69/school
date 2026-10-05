import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { ChoixEcole, ContexteSession } from '@scolaly/contracts';
import { ecolesDuCompte, type Database } from '@scolaly/db';
import { ACCESS_RESOLVER, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import type { Auth } from '../../auth/auth.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { AUTH, DATABASE } from '../../shared/tokens.js';

/** Contexte de la session et sélecteur d'école (RG-00-26, RG-01-29). */
@Controller('api/session')
export class SessionController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
  ) {}

  @Get('contexte')
  @Authenticated()
  @ApiContract({
    summary: 'Contexte de la session (école, droits, modules)',
    response: ContexteSession,
  })
  contexte(@Req() request: ScolalyRequest): Promise<ContexteSession> {
    return this.contexteDe(request.userId ?? '', request.activeOrganisationId ?? null);
  }

  @Post('ecole')
  @HttpCode(200)
  @Authenticated()
  @ApiContract({ summary: 'Changer d’école active', body: ChoixEcole, response: ContexteSession })
  async choisirEcole(
    @Body() choix: ChoixEcole,
    @Req() request: ScolalyRequest,
  ): Promise<ContexteSession> {
    const userId = request.userId ?? '';
    const ecoles = await ecolesDuCompte(this.db, userId);
    if (!ecoles.some((e) => e.organisationId === choix.organisationId)) {
      throw new ForbiddenException(
        "Vous n'avez pas de fiche dans cette école. Demandez à son administrateur de vous y inviter.",
      );
    }
    const context = await this.auth.$context;
    await context.internalAdapter.updateSession(request.sessionToken ?? '', {
      activeOrganisationId: choix.organisationId,
    });
    return this.contexteDe(userId, choix.organisationId);
  }

  private async contexteDe(
    userId: string,
    activeOrganisationId: string | null,
  ): Promise<ContexteSession> {
    const ecoles = (await ecolesDuCompte(this.db, userId)).map((e) => ({
      id: e.organisationId,
      nom: e.nom,
      nomAffichage: e.nomAffichage,
      acces: e.acces,
    }));
    const ecoleActive = ecoles.find((e) => e.id === activeOrganisationId) ?? null;
    const access = ecoleActive ? await this.resolver.resolve(userId, ecoleActive.id) : null;
    return {
      ecoleActive,
      ecoles,
      permissions: access ? [...access.permissions].sort() : [],
      modules: access ? [...access.modules].sort() : [],
      doubleAuthentificationExigee: access?.doubleAuthentificationExigee ?? false,
    };
  }
}
