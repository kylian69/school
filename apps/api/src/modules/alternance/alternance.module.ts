import { Module } from '@nestjs/common';
import { AnnuaireEntreprises } from '../../shared/annuaire.js';
import { EntreprisesController } from './entreprises.controller.js';
import { EntreprisesService } from './entreprises.service.js';

/** Alternance et stages (module 03) : entreprises et tuteurs (I3.3). */
@Module({
  controllers: [EntreprisesController],
  providers: [AnnuaireEntreprises, EntreprisesService],
  exports: [EntreprisesService],
})
export class AlternanceModule {}
