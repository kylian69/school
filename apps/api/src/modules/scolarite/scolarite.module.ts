import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service.js';
import { ScolariteController } from './scolarite.controller.js';

/** Scolarité (module 02) : promotions, groupes et inscriptions (I3.2). */
@Module({
  controllers: [ScolariteController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class ScolariteModule {}
