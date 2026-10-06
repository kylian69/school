import { Module } from '@nestjs/common';
import { ApparenceController } from './apparence.controller.js';
import { ApparenceService } from './apparence.service.js';
import { CalendrierController } from './calendrier.controller.js';
import { CalendrierService } from './calendrier.service.js';
import { OrganisationController } from './organisation.controller.js';
import { OrganisationService } from './organisation.service.js';

/** Structure de l'école : organisation, établissements, calendrier, apparence (I1.3). */
@Module({
  controllers: [OrganisationController, CalendrierController, ApparenceController],
  providers: [OrganisationService, CalendrierService, ApparenceService],
  exports: [ApparenceService],
})
export class StructureModule {}
