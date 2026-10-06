import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ACCESS_RULE, type AccessRule } from './access.decorators.js';

/**
 * Contrôle au démarrage (plan, section 6) : l'API refuse de démarrer si une route ne déclare
 * ni @Public, ni @Authenticated, ni @RequirePermission.
 */
@Injectable()
export class AccessDeclarationCheck implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const missing: string[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      const classRule = this.reflector.get<AccessRule | undefined>(
        ACCESS_RULE,
        instance.constructor,
      );
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as (...args: unknown[]) => unknown;
        const isRoute = Reflect.getMetadata('path', handler) !== undefined;
        if (isRoute && !classRule && !this.reflector.get(ACCESS_RULE, handler)) {
          missing.push(`${instance.constructor.name}.${name}`);
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Routes sans règle d'accès : ${missing.join(', ')}. ` +
          'Ajouter @Public(), @Authenticated() ou @RequirePermission(...) sur chacune.',
      );
    }
  }
}
