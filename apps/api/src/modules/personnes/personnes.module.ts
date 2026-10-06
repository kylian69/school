import { Module } from '@nestjs/common';
import { AttributionsController } from './attributions.controller.js';
import { AttributionsService } from './attributions.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { PersonnesController } from './personnes.controller.js';
import { PersonnesService } from './personnes.service.js';

/** Personnes et imports (I1.4). */
@Module({
  controllers: [PersonnesController, AttributionsController, ImportsController],
  providers: [PersonnesService, AttributionsService, ImportsService],
})
export class PersonnesModule {}
