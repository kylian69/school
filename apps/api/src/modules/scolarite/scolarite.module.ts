import { Module } from '@nestjs/common';
import { ReferentielModule } from '../referentiel/index.js';
import { AffectationsService } from './affectations.service.js';
import { AnneeSuivanteService } from './annee-suivante.service.js';
import { MaFormationService } from './ma-formation.service.js';
import { PromotionsService } from './promotions.service.js';
import { MoiScolariteController, RessourcesController } from './ressources.controller.js';
import { SallesService } from './salles.service.js';
import { ScolariteController } from './scolarite.controller.js';

/** Scolarité (module 02) : promotions, groupes et inscriptions (I3.2). */
@Module({
  imports: [ReferentielModule],
  controllers: [ScolariteController, RessourcesController, MoiScolariteController],
  providers: [
    AnneeSuivanteService,
    PromotionsService,
    SallesService,
    AffectationsService,
    MaFormationService,
  ],
  exports: [PromotionsService],
})
export class ScolariteModule {}
