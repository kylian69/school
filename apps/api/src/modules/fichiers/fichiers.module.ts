import { Module } from '@nestjs/common';
import { TelechargementsController } from './telechargements.controller.js';
import { TelechargementsService } from './telechargements.service.js';

/** Fichiers privés : téléchargement par l'API, sans exposer le stockage S3 (ADR 0007). */
@Module({
  controllers: [TelechargementsController],
  providers: [TelechargementsService],
  exports: [TelechargementsService],
})
export class FichiersModule {}
