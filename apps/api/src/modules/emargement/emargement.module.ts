import { Module } from '@nestjs/common';
import { AppelService } from './appel.service.js';
import { AppelController, ScanController } from './emargement.controller.js';
import { ScanService } from './scan.service.js';

/** Émargement : chemin rapide du scan et appel de l'intervenant (P2). */
@Module({ controllers: [ScanController, AppelController], providers: [ScanService, AppelService] })
export class EmargementModule {}
