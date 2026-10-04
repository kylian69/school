import { RequestMethod, type INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { z } from 'zod';
import { ACCESS_RULE, type AccessRule } from '../access/access.decorators.js';
import { API_CONTRACT, type ApiContractOptions } from './api-contract.js';

const joinPath = (...parts: string[]) =>
  `/${parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/')}`.replace(/:(\w+)/g, '{$1}');

const COMPONENT_URI = (id: string) => `#/components/schemas/${id}`;

/** Schéma d'une route : référence vers `components` s'il porte un identifiant, sinon en ligne. */
const jsonSchema = (schema: z.ZodType) => {
  const id = z.globalRegistry.get(schema)?.id;
  return id ? { $ref: COMPONENT_URI(id) } : z.toJSONSchema(schema, { target: 'openapi-3.0' });
};

/** Schémas réutilisables de packages/contracts (ceux qui portent `.meta({ id })`). */
function componentSchemas() {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    target: 'openapi-3.0',
    uri: COMPONENT_URI,
  });
  return Object.fromEntries(
    Object.entries(schemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, { $id: _id, ...schema }]) => [id, schema]),
  );
}

/**
 * Document OpenAPI 3.1 construit à partir des routes Nest, de leur contrat Zod et de leur règle
 * d'accès (`x-scolaly-access`). Il est versionné : la CI signale toute modification non régénérée.
 */
export function buildOpenApiDocument(app: INestApplication, version: string) {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    if (!instance) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const base = String(Reflect.getMetadata('path', instance.constructor) ?? '');
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as (...args: unknown[]) => unknown;
      const routePath = Reflect.getMetadata('path', handler) as string | undefined;
      if (routePath === undefined) continue;
      const method =
        RequestMethod[Reflect.getMetadata('method', handler) as RequestMethod].toLowerCase();
      const status = Number(
        Reflect.getMetadata('__httpCode__', handler) ?? (method === 'post' ? 201 : 200),
      );
      const contract = reflector.get<ApiContractOptions | undefined>(API_CONTRACT, handler);
      const access =
        reflector.get<AccessRule | undefined>(ACCESS_RULE, handler) ??
        reflector.get<AccessRule | undefined>(ACCESS_RULE, instance.constructor);
      const path = joinPath(base, routePath);
      paths[path] = {
        ...paths[path],
        [method]: {
          operationId: `${instance.constructor.name}.${name}`,
          summary: contract?.summary ?? name,
          'x-scolaly-access': access,
          ...(contract?.body
            ? {
                requestBody: {
                  required: true,
                  content: { 'application/json': { schema: jsonSchema(contract.body) } },
                },
              }
            : {}),
          responses: {
            [status]: {
              description: 'Succès',
              ...(contract
                ? { content: { 'application/json': { schema: jsonSchema(contract.response) } } }
                : {}),
            },
          },
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: 'API Scolaly', version },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    components: { schemas: componentSchemas() },
  };
}
