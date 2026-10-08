import { Module } from '@nestjs/common';
import { AlternanceModule } from '../alternance/index.js';
import { ContexteService } from './contexte.service.js';
import { SeancesController } from './seances.controller.js';
import { SeancesService } from './seances.service.js';

/** Calendrier et emplois du temps (module 04) : séances, séries, conflits et publication (I4.1). */
@Module({
  imports: [AlternanceModule],
  controllers: [SeancesController],
  providers: [ContexteService, SeancesService],
})
export class EmploiDuTempsModule {}
