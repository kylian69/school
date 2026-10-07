import { Module } from '@nestjs/common';
import { AnnuaireEntreprises } from '../../shared/annuaire.js';
import { ContratsController } from './contrats.controller.js';
import { ContratsService } from './contrats.service.js';
import { EntreprisesController } from './entreprises.controller.js';
import { EntreprisesService } from './entreprises.service.js';

/** Alternance et stages (module 03) : entreprises, tuteurs, contrats et conventions (I3.3). */
@Module({
  controllers: [EntreprisesController, ContratsController],
  providers: [AnnuaireEntreprises, EntreprisesService, ContratsService],
  exports: [EntreprisesService],
})
export class AlternanceModule {}
