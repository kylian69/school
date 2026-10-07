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
  ContactEntreprise,
  Entreprise,
  ListeEntreprises,
  ListeOpcos,
  ModificationContact,
  ModificationEntreprise,
  NouveauContact,
  NouvelleEntreprise,
  RechercheEntreprises,
  RechercheSiret,
} from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { EntreprisesService } from './entreprises.service.js';

const LECTURE = ['entreprises:lire', 'entreprises:gerer'] as const;
const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/** Entreprises, contacts et tuteurs (E-03-01, E-03-02). */
@Controller('api')
export class EntreprisesController {
  constructor(private readonly entreprises: EntreprisesService) {}

  @Get('opcos')
  @RequirePermission(LECTURE)
  @ApiContract({ summary: 'Opérateurs de compétences (table datée)', response: ListeOpcos })
  opcos() {
    return this.entreprises.listerOpcos();
  }

  @Get('entreprises/siret/:siret')
  @RequirePermission(LECTURE)
  @ApiContract({
    summary: 'Rechercher un SIRET dans l’école puis dans l’annuaire public (RG-03-01)',
    response: RechercheSiret,
  })
  rechercherSiret(@Param('siret') siret: string) {
    return this.entreprises.rechercherSiret(RequestContext.tx(), siret);
  }

  @Get('entreprises')
  @RequirePermission(LECTURE)
  @ApiContract({
    summary: 'Entreprises de l’école, filtrables',
    query: RechercheEntreprises,
    response: ListeEntreprises,
  })
  lister(@Query() recherche: RechercheEntreprises) {
    return this.entreprises.lister(...ctx(), recherche);
  }

  @Post('entreprises')
  @RequirePermission('entreprises:gerer')
  @ApiContract({
    summary: 'Créer une entreprise à partir de son SIRET (US-03-01)',
    body: NouvelleEntreprise,
    response: Entreprise,
  })
  creer(@Body() entree: NouvelleEntreprise, @Req() request: ScolalyRequest) {
    return this.entreprises.creer(...ctx(), entree, request.ip);
  }

  @Get('entreprises/:id')
  @RequirePermission(LECTURE)
  @ApiContract({ summary: 'Une entreprise, ses contacts et ses tuteurs', response: Entreprise })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.entreprises.lire(...ctx(), id);
  }

  @Patch('entreprises/:id')
  @RequirePermission('entreprises:gerer')
  @ApiContract({
    summary: 'Modifier une entreprise (IDCC, OPCO, statut…)',
    body: ModificationEntreprise,
    response: Entreprise,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationEntreprise,
    @Req() request: ScolalyRequest,
  ) {
    return this.entreprises.modifier(...ctx(), id, changement, request.ip);
  }

  @Post('entreprises/:id/contacts')
  @RequirePermission('entreprises:gerer')
  @ApiContract({
    summary: 'Ajouter un contact ou un tuteur (RG-03-03)',
    body: NouveauContact,
    response: ContactEntreprise,
  })
  ajouterContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entree: NouveauContact,
    @Req() request: ScolalyRequest,
  ) {
    return this.entreprises.ajouterContact(...ctx(), id, entree, request.ip);
  }

  @Patch('contacts-entreprise/:id')
  @RequirePermission('entreprises:gerer')
  @ApiContract({
    summary: 'Modifier un contact',
    body: ModificationContact,
    response: ContactEntreprise,
  })
  modifierContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationContact,
    @Req() request: ScolalyRequest,
  ) {
    return this.entreprises.modifierContact(...ctx(), id, changement, request.ip);
  }

  @Delete('contacts-entreprise/:id')
  @HttpCode(204)
  @RequirePermission('entreprises:gerer')
  @ApiContract({ summary: 'Retirer un contact de l’entreprise', response: z.null() })
  async retirerContact(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.entreprises.retirerContact(...ctx(), id, request.ip);
    return null;
  }
}
