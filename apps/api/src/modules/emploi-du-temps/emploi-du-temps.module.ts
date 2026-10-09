import { Module } from '@nestjs/common';
import { AlternanceModule } from '../alternance/index.js';
import { ContexteService } from './contexte.service.js';
import { GrilleService } from './grille.service.js';
import { ImportEdtController } from './import.controller.js';
import { ImportEdtService } from './import.service.js';
import { SeancesController } from './seances.controller.js';
import { SeancesService } from './seances.service.js';

/**
 * Calendrier et emplois du temps (module 04) : séances, séries, conflits et publication (I4.1),
 * import (I4.2).
 */
@Module({
  imports: [AlternanceModule],
  controllers: [SeancesController, ImportEdtController],
  providers: [ContexteService, GrilleService, SeancesService, ImportEdtService],
})
export class EmploiDuTempsModule {}
