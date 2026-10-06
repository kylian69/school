import { Controller, Get, Req } from '@nestjs/common';
import { MembrePlateforme } from '@scolaly/contracts';
import { Plateforme } from '../../access/access.decorators.js';
import type { ScolalyRequest } from '../../access/access.guard.js';
import { ApiContract } from '../../contracts/api-contract.js';

/** Rôle de la personne connectée dans l'équipe Scolaly (404 si elle n'en fait pas partie). */
@Controller('api/plateforme/moi')
export class MoiController {
  @Get()
  @Plateforme('super_administrateur', 'support')
  @ApiContract({ summary: 'Mon rôle dans la console', response: MembrePlateforme })
  moi(@Req() request: ScolalyRequest): MembrePlateforme {
    return { role: request.rolePlateforme ?? 'support' };
  }
}
