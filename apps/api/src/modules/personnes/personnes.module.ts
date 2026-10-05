import { Module } from '@nestjs/common';
import { AttributionsController } from './attributions.controller.js';
import { AttributionsService } from './attributions.service.js';
import { PersonnesController } from './personnes.controller.js';
import { PersonnesService } from './personnes.service.js';

/** Personnes et imports (I1.4). */
@Module({
  controllers: [PersonnesController, AttributionsController],
  providers: [PersonnesService, AttributionsService],
})
export class PersonnesModule {}
