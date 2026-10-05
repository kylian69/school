import { Module } from '@nestjs/common';
import { PersonnesController } from './personnes.controller.js';
import { PersonnesService } from './personnes.service.js';

/** Personnes et imports (I1.4). */
@Module({ controllers: [PersonnesController], providers: [PersonnesService] })
export class PersonnesModule {}
