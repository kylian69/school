import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  AjoutMembres,
  ChangementStatut,
  DetailPromotion,
  Groupe,
  Inscription,
  ListePromotions,
  ModificationGroupe,
  ModificationInscription,
  ModificationPromotion,
  NouvelleInscription,
  NouvellePromotion,
  RecherchePromotions,
  ResultatRepartition,
  RetraitMembre,
  SaisieGroupe,
  SaisieRepartition,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { PromotionsService } from './promotions.service.js';

const LECTURE = ['promotions:lire', 'promotions:gerer'] as const;
const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Promotions de l'année et promotion (E-02-04, E-02-05 ; RG-02-12 à RG-02-17). */
@Controller('api')
export class ScolariteController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('promotions')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({
    summary: 'Promotions dans le périmètre de la personne, avec leurs effectifs par statut',
    query: RecherchePromotions,
    response: ListePromotions,
  })
  lister(@Query() recherche: RecherchePromotions) {
    return this.promotions.lister(...ctx(), recherche);
  }

  @Post('promotions')
  @RequirePermission('promotions:gerer', 'etablissement')
  @ApiContract({
    summary: 'Créer une promotion (RG-02-12)',
    body: NouvellePromotion,
    response: DetailPromotion,
  })
  creer(@Body() entree: NouvellePromotion, @Req() request: ScolalyRequest) {
    return this.promotions.creer(...ctx(), entree, request.ip);
  }

  @Get('promotions/:id')
  @RequirePermission(LECTURE, 'promotion')
  @ApiContract({ summary: 'Une promotion : groupes et inscriptions', response: DetailPromotion })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.lire(...ctx(), id);
  }

  @Patch('promotions/:id')
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier une promotion ; changer de version demande un droit spécifique (RG-02-05)',
    body: ModificationPromotion,
    response: DetailPromotion,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationPromotion,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.modifier(...ctx(), id, changement, request.ip);
  }

  @Post('promotions/:id/inscriptions')
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Inscrire un apprenant avec son statut (RG-02-13)',
    body: NouvelleInscription,
    response: Inscription,
  })
  inscrire(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: NouvelleInscription,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.inscrire(...ctx(), id, entree, request.ip);
  }

  @Patch('inscriptions/:id')
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Modifier une inscription : état, sortie et motif (RG-02-17), option',
    body: ModificationInscription,
    response: Inscription,
  })
  modifierInscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationInscription,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.modifierInscription(...ctx(), id, changement, request.ip);
  }

  @Post('inscriptions/:id/statut')
  @HttpCode(200)
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Changer le statut à une date d’effet (section 7)',
    body: ChangementStatut,
    response: Inscription,
  })
  changerStatut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ChangementStatut,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.changerStatut(...ctx(), id, changement, request.ip);
  }

  @Post('promotions/:id/groupes')
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Créer un groupe, éventuellement transversal (RG-02-14)',
    body: SaisieGroupe,
    response: Groupe,
  })
  creerGroupe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieGroupe,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.creerGroupe(...ctx(), id, saisie, request.ip);
  }

  @Patch('groupes/:id')
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({ summary: 'Modifier un groupe', body: ModificationGroupe, response: Groupe })
  modifierGroupe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationGroupe,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.modifierGroupe(...ctx(), id, changement, request.ip);
  }

  @Delete('groupes/:id')
  @HttpCode(204)
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({ summary: 'Supprimer un groupe qui n’a jamais eu de membre', response: z.null() })
  async supprimerGroupe(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.promotions.supprimerGroupe(...ctx(), id, request.ip);
    return null;
  }

  @Post('groupes/:id/membres')
  @HttpCode(200)
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Ajouter des apprenants à un groupe à une date d’effet (changement de groupe compris)',
    body: AjoutMembres,
    response: Groupe,
  })
  ajouterMembres(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: AjoutMembres,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.ajouterMembres(...ctx(), id, entree, request.ip);
  }

  @Post('groupes/:id/retrait')
  @HttpCode(200)
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Retirer un apprenant d’un groupe à une date',
    body: RetraitMembre,
    response: Groupe,
  })
  retirerMembre(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: RetraitMembre,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.retirerMembre(...ctx(), id, entree, request.ip);
  }

  @Post('promotions/:id/repartition')
  @HttpCode(200)
  @RequirePermission('promotions:gerer', 'promotion')
  @ApiContract({
    summary: 'Répartir automatiquement les apprenants dans des groupes (RG-02-16)',
    body: SaisieRepartition,
    response: ResultatRepartition,
  })
  repartir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saisie: SaisieRepartition,
    @Req() request: ScolalyRequest,
  ) {
    return this.promotions.repartir(...ctx(), id, saisie, request.ip);
  }
}
