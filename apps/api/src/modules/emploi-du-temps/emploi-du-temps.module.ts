import { Module } from '@nestjs/common';
import { AlternanceModule } from '../alternance/index.js';
import { ContexteService } from './contexte.service.js';
import { DisponibilitesController } from './disponibilites.controller.js';
import { DisponibilitesService } from './disponibilites.service.js';
import { FluxIcalController, FluxIcalPublicController } from './flux-ical.controller.js';
import { FluxIcalService } from './flux-ical.service.js';
import { GrilleService } from './grille.service.js';
import { ImportEdtController } from './import.controller.js';
import { ImportEdtService } from './import.service.js';
import { SeancesController } from './seances.controller.js';
import { SeancesService } from './seances.service.js';

/**
 * Calendrier et emplois du temps (module 04) : séances, séries, conflits et publication (I4.1),
 * import et flux iCal personnels (I4.2), disponibilités déclarées par l'intervenant (E-04-07).
 */
@Module({
  imports: [AlternanceModule],
  controllers: [
    SeancesController,
    ImportEdtController,
    FluxIcalController,
    FluxIcalPublicController,
    DisponibilitesController,
  ],
  providers: [
    ContexteService,
    GrilleService,
    SeancesService,
    ImportEdtService,
    FluxIcalService,
    DisponibilitesService,
  ],
})
export class EmploiDuTempsModule {}
