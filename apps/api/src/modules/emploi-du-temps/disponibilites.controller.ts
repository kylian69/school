import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  MesDisponibilites,
  SaisieCreneauDisponibilite,
  SaisieIndisponibilite,
} from '@scolaly/contracts';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { DisponibilitesService } from './disponibilites.service.js';

const ctx = () => [RequestContext.tx(), RequestContext.access()] as const;

/**
 * E-04-07 · Mes disponibilités (RG-04-18, US-04-10) : saisie par l'intervenant connecté, sur sa
 * seule fiche. Réponses jamais mises en cache : elles portent le motif des indisponibilités.
 */
@Controller('api/moi/disponibilites')
export class DisponibilitesController {
  constructor(private readonly disponibilites: DisponibilitesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermission('disponibilites:declarer', 'soi')
  @ApiContract({
    summary: 'Mes créneaux de disponibilité et mes indisponibilités à venir',
    response: MesDisponibilites,
  })
  lire() {
    return this.disponibilites.lire(...ctx());
  }

  @Post('creneaux')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('disponibilites:declarer', 'soi')
  @ApiContract({
    summary: 'Déclarer un créneau récurrent de disponibilité',
    body: SaisieCreneauDisponibilite,
    response: MesDisponibilites,
  })
  ajouterCreneau(@Body() saisie: SaisieCreneauDisponibilite, @Req() request: ScolalyRequest) {
    return this.disponibilites.ajouterCreneau(...ctx(), saisie, request.ip);
  }

  @Delete('creneaux/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('disponibilites:declarer', 'soi')
  @ApiContract({ summary: 'Retirer un créneau de disponibilité', response: MesDisponibilites })
  retirerCreneau(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.disponibilites.retirerCreneau(...ctx(), id, request.ip);
  }

  @Post('indisponibilites')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('disponibilites:declarer', 'soi')
  @ApiContract({
    summary: 'Déclarer une indisponibilité ponctuelle, motif facultatif',
    body: SaisieIndisponibilite,
    response: MesDisponibilites,
  })
  ajouterIndisponibilite(@Body() saisie: SaisieIndisponibilite, @Req() request: ScolalyRequest) {
    return this.disponibilites.ajouterIndisponibilite(...ctx(), saisie, request.ip);
  }

  @Delete('indisponibilites/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('disponibilites:declarer', 'soi')
  @ApiContract({ summary: 'Retirer une indisponibilité', response: MesDisponibilites })
  retirerIndisponibilite(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    return this.disponibilites.retirerIndisponibilite(...ctx(), id, request.ip);
  }
}
