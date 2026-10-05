import {
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { DatabaseHandle } from '@scolaly/db';
import type { Redis } from 'ioredis';
import { AccessModule } from './access/access.module.js';
import type { Auth } from './auth/auth.js';
import type { Env } from './config/env.js';
import { ContractValidationInterceptor } from './contracts/contract-validation.interceptor.js';
import { HealthController } from './health/health.controller.js';
import { PlateformeModule } from './modules/plateforme/index.js';
import type { ObjectStorage } from './shared/storage/object-storage.js';
import type { UploadService } from './shared/storage/uploads.js';
import { AUTH, DATABASE, ENV, OBJECT_STORAGE, UPLOADS, VALKEY } from './shared/tokens.js';

export interface AppResources {
  env: Env;
  database: DatabaseHandle;
  valkey: Redis;
  auth: Auth;
  storage: ObjectStorage;
  uploads: UploadService;
  /** Connexion du rôle plateforme (mode SaaS seulement, ADR 0004). */
  platformDatabase?: DatabaseHandle;
}

const RESOURCES = Symbol('RESOURCES');

class ResourcesLifecycle implements OnApplicationShutdown {
  constructor(@Inject(RESOURCES) private readonly resources: AppResources) {}

  async onApplicationShutdown(): Promise<void> {
    await this.resources.database.close();
    this.resources.valkey.disconnect();
    this.resources.storage.destroy();
    await this.resources.platformDatabase?.close();
  }
}

@Module({})
export class AppModule {
  static forRoot(
    resources: AppResources,
    options: { accessResolver?: Provider; extraModules?: Type[] } = {},
  ): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        AccessModule.forRoot(options.accessResolver),
        ...(resources.platformDatabase
          ? [PlateformeModule.forRoot(resources.platformDatabase.db)]
          : []),
        ...(options.extraModules ?? []),
      ],
      controllers: [HealthController],
      providers: [
        { provide: RESOURCES, useValue: resources },
        { provide: ENV, useValue: resources.env },
        { provide: DATABASE, useValue: resources.database.db },
        { provide: VALKEY, useValue: resources.valkey },
        { provide: AUTH, useValue: resources.auth },
        { provide: OBJECT_STORAGE, useValue: resources.storage },
        { provide: UPLOADS, useValue: resources.uploads },
        ResourcesLifecycle,
        { provide: APP_INTERCEPTOR, useClass: ContractValidationInterceptor },
      ],
      exports: [ENV, DATABASE, VALKEY, AUTH, OBJECT_STORAGE, UPLOADS],
    };
  }
}
