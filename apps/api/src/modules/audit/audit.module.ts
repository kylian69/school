import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

/** Journal d'audit consultable (I1.4). */
@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}
