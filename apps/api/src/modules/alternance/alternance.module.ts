import { Module } from '@nestjs/common';
import { AnnuaireEntreprises } from '../../shared/annuaire.js';
import { ContratsController } from './contrats.controller.js';
import { ContratsService } from './contrats.service.js';
import { EntreprisesController } from './entreprises.controller.js';
import { EntreprisesService } from './entreprises.service.js';
import { RythmesController } from './rythmes.controller.js';
import { RythmesService } from './rythmes.service.js';

/** Alternance et stages (module 03) : entreprises, tuteurs, contrats, conventions et rythmes (I3.3). */
@Module({
  controllers: [EntreprisesController, ContratsController, RythmesController],
  providers: [AnnuaireEntreprises, EntreprisesService, ContratsService, RythmesService],
  exports: [EntreprisesService, RythmesService],
})
export class AlternanceModule {}
