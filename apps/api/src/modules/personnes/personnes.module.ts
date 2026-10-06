import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller.js';
import { ActionsService } from './actions.service.js';
import { AttributionsController } from './attributions.controller.js';
import { AttributionsService } from './attributions.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { PersonnesController } from './personnes.controller.js';
import { PersonnesService } from './personnes.service.js';
import { MaPhotoController, PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';
import { ValidationImportService } from './validation-import.service.js';

/** Personnes, photos et imports (I1.4). */
@Module({
  controllers: [
    ActionsController,
    PersonnesController,
    PhotosController,
    MaPhotoController,
    AttributionsController,
    ImportsController,
  ],
  providers: [
    ActionsService,
    PersonnesService,
    PhotosService,
    AttributionsService,
    ImportsService,
    ValidationImportService,
  ],
})
export class PersonnesModule {}
