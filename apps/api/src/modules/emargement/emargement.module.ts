import { Module } from '@nestjs/common';
import { FichiersModule } from '../fichiers/index.js';
import { AppelService } from './appel.service.js';
import { AssiduiteController } from './assiduite.controller.js';
import { AssiduiteService } from './assiduite.service.js';
import {
  AppelController,
  PhotosAppelController,
  ScanController,
  SeancesController,
} from './emargement.controller.js';
import { JustificatifsController } from './justificatifs.controller.js';
import { JustificatifsService } from './justificatifs.service.js';
import { ScanService } from './scan.service.js';
import { SeancesService } from './seances.service.js';

/** Émargement : chemin rapide du scan et appel de l'intervenant (P2). */
@Module({
  imports: [FichiersModule],
  controllers: [
    ScanController,
    AppelController,
    PhotosAppelController,
    SeancesController,
    AssiduiteController,
    JustificatifsController,
  ],
  providers: [ScanService, AppelService, SeancesService, AssiduiteService, JustificatifsService],
})
export class EmargementModule {}
