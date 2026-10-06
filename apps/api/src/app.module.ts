import { Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import type { DatabaseHandle } from '@scolaly/db';
import type { Redis } from 'ioredis';
import type { Auth } from './auth/auth.js';
import type { Env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { AUTH, DATABASE, ENV, VALKEY } from './shared/tokens.js';

export interface AppResources {
  env: Env;
  database: DatabaseHandle;
  valkey: Redis;
  auth: Auth;
}

const RESOURCES = Symbol('RESOURCES');

class ResourcesLifecycle implements OnApplicationShutdown {
  constructor(@Inject(RESOURCES) private readonly resources: AppResources) {}

  async onApplicationShutdown(): Promise<void> {
    await this.resources.database.close();
    this.resources.valkey.disconnect();
  }
}

@Module({})
export class AppModule {
  static forRoot(resources: AppResources): DynamicModule {
    return {
      module: AppModule,
      global: true,
      controllers: [HealthController],
      providers: [
        { provide: RESOURCES, useValue: resources },
        { provide: ENV, useValue: resources.env },
        { provide: DATABASE, useValue: resources.database.db },
        { provide: VALKEY, useValue: resources.valkey },
        { provide: AUTH, useValue: resources.auth },
        ResourcesLifecycle,
      ],
      exports: [ENV, DATABASE, VALKEY, AUTH],
    };
  }
}
