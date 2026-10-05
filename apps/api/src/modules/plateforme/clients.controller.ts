import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ChangementEtatClient,
  ClientFiche,
  ExceptionModule,
  FiltreClients,
  ListeClients,
  NouveauClient,
} from '@scolaly/contracts';
import { Plateforme } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { ClientsService, type Auteur } from './clients.service.js';

const auteurDe = (request: ScolalyRequest): Auteur => ({
  userId: request.userId ?? '',
  adresseIp: request.ip,
});

/** Console de la plateforme : clients (écrans E-19-01 à E-19-03). */
@Controller('api/plateforme/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Plateforme('super_administrateur', 'support')
  @ApiContract({ summary: 'Lister les clients', query: FiltreClients, response: ListeClients })
  async lister(@Query() filtre: FiltreClients) {
    return { clients: await this.clients.lister(filtre) };
  }

  @Post()
  @Plateforme('super_administrateur')
  @ApiContract({
    summary: 'Créer un client (devis signé)',
    body: NouveauClient,
    response: ClientFiche,
  })
  creer(@Body() entree: NouveauClient, @Req() request: ScolalyRequest) {
    return this.clients.creer(entree, auteurDe(request));
  }

  @Get(':id')
  @Plateforme('super_administrateur', 'support')
  @ApiContract({ summary: 'Fiche d’un client', response: ClientFiche })
  fiche(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.fiche(id);
  }

  @Post(':id/etat')
  @HttpCode(200)
  @Plateforme('super_administrateur')
  @ApiContract({
    summary: 'Changer l’état d’un client',
    body: ChangementEtatClient,
    response: ClientFiche,
  })
  changerEtat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ChangementEtatClient,
    @Req() request: ScolalyRequest,
  ) {
    return this.clients.changerEtat(id, changement, auteurDe(request));
  }

  @Put(':id/modules')
  @Plateforme('super_administrateur')
  @ApiContract({
    summary: 'Ouvrir ou fermer un module hors formule',
    body: ExceptionModule,
    response: ClientFiche,
  })
  exceptionModule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() exception: ExceptionModule,
    @Req() request: ScolalyRequest,
  ) {
    return this.clients.exceptionModule(id, exception, auteurDe(request));
  }
}
