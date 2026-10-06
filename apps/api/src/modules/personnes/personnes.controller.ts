import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ListePersonnes,
  ModificationPersonne,
  NouvellePersonne,
  PersonneDetail,
  RecherchePersonnes,
} from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { PersonnesService } from './personnes.service.js';

/** Personnes de l'école active : liste, création et fiche (E-01-04, E-01-05). */
@Controller('api/personnes')
export class PersonnesController {
  constructor(private readonly personnes: PersonnesService) {}

  @Get()
  @RequirePermission('personnes:lire')
  @ApiContract({
    summary: 'Personnes de l’école : recherche, filtres et pagination',
    query: RecherchePersonnes,
    response: ListePersonnes,
  })
  lister(@Query() recherche: RecherchePersonnes) {
    return this.personnes.lister(RequestContext.tx(), RequestContext.access(), recherche);
  }

  @Post()
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Créer une fiche, après recherche des doublons (RG-01-07)',
    body: NouvellePersonne,
    response: PersonneDetail,
  })
  creer(@Body() entree: NouvellePersonne, @Req() request: ScolalyRequest) {
    return this.personnes.creer(RequestContext.tx(), RequestContext.access(), entree, request.ip);
  }

  @Get(':id')
  @RequirePermission('personnes:lire')
  @ApiContract({ summary: 'Fiche d’une personne', response: PersonneDetail })
  lire(@Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.lire(RequestContext.tx(), RequestContext.access(), id);
  }

  @Patch(':id')
  @RequirePermission(['apprenants:inviter', 'personnel:inviter'])
  @ApiContract({
    summary: 'Modifier l’identité d’une personne (version contrôlée)',
    body: ModificationPersonne,
    response: PersonneDetail,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationPersonne,
    @Req() request: ScolalyRequest,
  ) {
    return this.personnes.modifier(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      changement,
      request.ip,
    );
  }
}
