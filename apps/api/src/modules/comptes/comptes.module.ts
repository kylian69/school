import { Global, Module } from '@nestjs/common';
import { ComptesController, InvitationsController } from './comptes.controller.js';
import { InvitationsService } from './invitations.service.js';

@Global()
@Module({
  controllers: [ComptesController, InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class ComptesModule {}
