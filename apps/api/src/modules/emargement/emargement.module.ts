import { Module } from '@nestjs/common';
import { AppelService } from './appel.service.js';
import { AppelController, ScanController, SeancesController } from './emargement.controller.js';
import { ScanService } from './scan.service.js';
import { SeancesService } from './seances.service.js';

/** Émargement : chemin rapide du scan et appel de l'intervenant (P2). */
@Module({
  controllers: [ScanController, AppelController, SeancesController],
  providers: [ScanService, AppelService, SeancesService],
})
export class EmargementModule {}
