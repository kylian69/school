import { Controller, Get } from '@nestjs/common';
import { HealthResponse } from '@scolaly/contracts';
import { Public } from '../access/access.decorators.js';
import { ApiContract } from '../contracts/api-contract.js';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiContract({ summary: "État de l'API", response: HealthResponse })
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
