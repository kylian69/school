import { Global, Module } from '@nestjs/common';
import { ComptesController, InvitationsController } from './comptes.controller.js';
import { ComptesService } from './comptes.service.js';
import { InvitationsService } from './invitations.service.js';

@Global()
@Module({
  controllers: [ComptesController, InvitationsController],
  providers: [InvitationsService, ComptesService],
  exports: [InvitationsService],
})
export class ComptesModule {}
