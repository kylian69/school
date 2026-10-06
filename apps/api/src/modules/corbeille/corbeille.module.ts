import { Module } from '@nestjs/common';
import { CorbeilleController } from './corbeille.controller.js';
import { CorbeilleService } from './corbeille.service.js';

/** Corbeille (I1.4). */
@Module({ controllers: [CorbeilleController], providers: [CorbeilleService] })
export class CorbeilleModule {}
