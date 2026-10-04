import { Global, Module, type Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AccessDeclarationCheck } from './access-declaration.check.js';
import { ACCESS_RESOLVER, DenyAllAccessResolver } from './access-resolver.js';
import { AccessGuard } from './access.guard.js';
import { OrganisationContextInterceptor } from './organisation-context.interceptor.js';

@Global()
@Module({})
export class AccessModule {
  static forRoot(
    resolver: Provider = { provide: ACCESS_RESOLVER, useClass: DenyAllAccessResolver },
  ) {
    return {
      module: AccessModule,
      imports: [DiscoveryModule],
      providers: [
        resolver,
        AccessDeclarationCheck,
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_INTERCEPTOR, useClass: OrganisationContextInterceptor },
      ],
      exports: [ACCESS_RESOLVER],
    };
  }
}
