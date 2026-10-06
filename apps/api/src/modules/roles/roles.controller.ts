import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ListeRoles, ModificationRole, NouveauRole, RoleDetail } from '@scolaly/contracts';
import { z } from 'zod';
import { RequirePermission } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { RequestContext } from '../../access/request-context.js';
import { ApiContract } from '../../contracts/api-contract.js';
import { RolesService } from './roles.service.js';

/** Rôles et permissions de l'école active (E-01-07). */
@Controller('api/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission(['roles:gerer', 'roles:attribuer'])
  @ApiContract({
    summary: 'Rôles de l’école, leurs permissions et leurs titulaires',
    response: ListeRoles,
  })
  lister() {
    return this.roles.lister(RequestContext.tx());
  }

  @Post()
  @RequirePermission('roles:gerer')
  @ApiContract({
    summary: 'Créer un rôle personnalisé, vierge ou par duplication',
    body: NouveauRole,
    response: RoleDetail,
  })
  creer(@Body() entree: NouveauRole, @Req() request: ScolalyRequest) {
    return this.roles.creer(RequestContext.tx(), RequestContext.access(), entree, request.ip);
  }

  @Patch(':id')
  @RequirePermission('roles:gerer')
  @ApiContract({
    summary: 'Modifier un rôle (nom, permissions, double authentification)',
    body: ModificationRole,
    response: RoleDetail,
  })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changement: ModificationRole,
    @Req() request: ScolalyRequest,
  ) {
    return this.roles.modifier(
      RequestContext.tx(),
      RequestContext.access(),
      id,
      changement,
      request.ip,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('roles:gerer')
  @ApiContract({ summary: 'Supprimer un rôle personnalisé qui ne sert plus', response: z.null() })
  async supprimer(@Param('id', ParseUUIDPipe) id: string, @Req() request: ScolalyRequest) {
    await this.roles.supprimer(RequestContext.tx(), RequestContext.access(), id, request.ip);
  }
}
