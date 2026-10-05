import { Module } from '@nestjs/common';
import { OrganisationController } from './organisation.controller.js';
import { OrganisationService } from './organisation.service.js';

/** Structure de l'école : organisation, établissements, calendrier, apparence (I1.3). */
@Module({ controllers: [OrganisationController], providers: [OrganisationService] })
export class StructureModule {}
