import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { Database } from '@scolaly/db';
import { PLATEFORME_MEMBRES } from '../../access/plateforme-membres.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { MembresService } from './membres.service.js';
import { MoiController } from './moi.controller.js';
import { PLATFORM_DATABASE } from './tokens.js';

/** Console de la plateforme (module 19), montée en mode SaaS uniquement. */
@Global()
@Module({})
export class PlateformeModule {
  static forRoot(platformDb: Database): DynamicModule {
    return {
      module: PlateformeModule,
      controllers: [ClientsController, MoiController],
      providers: [
        { provide: PLATFORM_DATABASE, useValue: platformDb },
        ClientsService,
        MembresService,
        { provide: PLATEFORME_MEMBRES, useExisting: MembresService },
      ],
      exports: [PLATEFORME_MEMBRES],
    };
  }
}
