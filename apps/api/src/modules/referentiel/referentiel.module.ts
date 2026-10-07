import { Module } from '@nestjs/common';
import { BibliothequeService } from './bibliotheque.service.js';
import { FormationsService } from './formations.service.js';
import { MaquettesService } from './maquettes.service.js';
import {
  BibliothequeController,
  FormationsController,
  MaquettesController,
} from './referentiel.controller.js';

/** Référentiel pédagogique (module 02) : formations, maquettes, règles, compétences (I3.1). */
@Module({
  controllers: [FormationsController, MaquettesController, BibliothequeController],
  providers: [FormationsService, MaquettesService, BibliothequeService],
  exports: [FormationsService, MaquettesService],
})
export class ReferentielModule {}
