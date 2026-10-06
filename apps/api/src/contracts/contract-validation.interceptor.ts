import {
  BadRequestException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { API_CONTRACT, type ApiContractOptions } from './api-contract.js';

z.config(z.locales.fr());

function parse(schema: z.ZodType | undefined, value: unknown, where: string): unknown {
  if (!schema) return value;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : where;
    return `${path} : ${issue.message}`;
  });
  throw new BadRequestException({
    message: `Données invalides. Corrigez les champs signalés puis réessayez.`,
    details,
  });
}

/** Valide le corps et les paramètres de requête avec le contrat de la route. */
@Injectable()
export class ContractValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contract = this.reflector.get<ApiContractOptions | undefined>(
      API_CONTRACT,
      context.getHandler(),
    );
    if (contract) {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      request.body = parse(contract.body, request.body, 'corps');
      request.query = parse(contract.query, request.query, 'paramètres');
    }
    return next.handle();
  }
}
