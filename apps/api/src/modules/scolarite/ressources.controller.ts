import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  Affectation,
  AffectationsPromotion,
  ListeSalles,
  MaFormation,
  MesEnseignements,
  ModificationAffectation,
  ModificationSalle,
  RechercheSalles,
  SaisieAffectation,
  Salle,
  SaisieSalle,
} from '@scolaly/contracts';
import { withOrganisation, type Database } from '@scolaly/db';
import { z } from 'zod';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from '../../access/access-resolver.js';
import { Authenticated, RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DATABASE } from '../../shared/tokens.js';
import { AffectationsService } from './affectations.service.js';
import { MaFormationService } from './ma-formation.service.js';
import { SallesService } from './salles.service.js';

const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Salles (E-02-06) et affectations des intervenants (onglet « Intervenants » d'E-02-05). */
@Controller('api')
export class RessourcesController {
  constructor(
    private readonly salles: SallesService,
    private readonly affectations: AffectationsService,
  ) {}

  @Get('salles')
  @RequirePermission(['salles:lire', 'salles:gerer'])
  @ApiContract({
    summary: 'Salles des établissements, filtrables (RG-02-19)',
    query: RechercheSalles,
    response: ListeSalles,
  })
  listerSalles(@Query() recherche: RechercheSalles) {
    return this.salles.lister(...ctx(), recherche);
  }

  @Post('salles')
  @RequirePermission('salles:gerer', 'etablissement')
  @ApiContract({ summary: 'Décrire une salle (US-02-09)', body: SaisieSalle, response: Salle })
  creerSalle(@Body() saisie: SaisieSalle, @Req() request: ScolalyRequest) {
    return this.salles.creer(...ctx(), saisie, request.ip);
  }

  @Patch('salles/:id')
  @RequirePermission('salles:gerer', 'etablissement')
  @ApiContract({
    summary: 'Modifier ou fermer une salle',
    body: ModificationSalle,
    response: Salle,
  })
  modifierSalle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationSalle,
    @Req() request: ScolalyRequest,
  ) {
    return this.salles.modifier(...ctx(), id, changement, request.ip);
  }

  @Get('promotions/:id/affectations')
  @RequirePermission(['promotions:lire', 'promotions:gerer'], 'promotion')
  @ApiContract({
    summary: 'Affectations des intervenants et écarts d’heures avec la maquette (RG-02-18)',
    response: AffectationsPromotion,
  })
  listerAffectations(@Param('id', ParseUUIDPipe) id: string) {
    return this.affectations.lister(...ctx(), id);
  }

  @Post('promotions/:id/affectations')
  @RequirePermission('affectations:gerer', 'promotion')
  @ApiContract({
    summary: 'Affecter un intervenant à un module (US-02-08)',
    body: SaisieAffectation,
    response: Affectation,
  })
  creerAffectation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieAffectation,
    @Req() request: ScolalyRequest,
  ) {
    return this.affectations.creer(...ctx(), id, saisie, request.ip);
  }

  @Patch('affectations/:id')
  @RequirePermission('affectations:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier les groupes ou les heures d’une affectation',
    body: ModificationAffectation,
    response: Affectation,
  })
  modifierAffectation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationAffectation,
    @Req() request: ScolalyRequest,
  ) {
    return this.affectations.modifier(...ctx(), id, changement, request.ip);
  }

  @Delete('affectations/:id')
  @HttpCode(204)
  @RequirePermission('affectations:gerer', 'promotion')
  @ApiContract({ summary: 'Retirer une affectation', response: z.null() })
  async supprimerAffectation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: ScolalyRequest,
  ) {
    await this.affectations.supprimer(...ctx(), id, request.ip);
    return null;
  }
}

/** Vues personnelles : aucune permission, l'école est celle de la session. */
@Controller('api/moi')
export class MoiScolariteController {
  constructor(
    private readonly affectations: AffectationsService,
    private readonly maFormation: MaFormationService,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  private async access(request: ScolalyRequest): Promise<Access> {
    const access = await this.resolver.resolve(
      request.userId ?? '',
      request.activeOrganisationId ?? null,
    );
    if (!access) {
      throw new ForbiddenException(
        "Vous n'avez de fiche dans aucune école active. Choisissez votre école, puis réessayez.",
      );
    }
    return access;
  }

  @Get('enseignements')
  @Authenticated()
  @ApiContract({
    summary: 'Mes modules, groupes et heures prévues (E-02-08)',
    response: MesEnseignements,
  })
  async enseignements(@Req() request: ScolalyRequest) {
    const access = await this.access(request);
    return withOrganisation(this.db, access.organisationId, (tx) =>
      this.affectations.mesEnseignements(tx, access.personneId),
    );
  }

  @Get('formation')
  @Authenticated()
  @ApiContract({
    summary: 'Ma maquette : UE, modules, ECTS, coefficients et règles (E-02-07)',
    response: MaFormation,
  })
  async formation(@Req() request: ScolalyRequest) {
    const access = await this.access(request);
    return withOrganisation(this.db, access.organisationId, (tx) =>
      this.maFormation.lire(tx, access.personneId),
    );
  }
}
