import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth.js';
import { AUTH } from '../shared/tokens.js';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from './access-resolver.js';
import { ACCESS_RULE, type AccessRule } from './access.decorators.js';

export type ScolalyRequest = FastifyRequest & { access?: Access; userId?: string };

export function accessRuleOf(reflector: Reflector, context: ExecutionContext) {
  return reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/** Vérifie la session, puis la permission dans l'organisation active (RG-00-10, RG-01-16). */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = accessRuleOf(this.reflector, context);
    if (!rule) {
      throw new InternalServerErrorException('Route sans règle d’accès déclarée.');
    }
    if (rule.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<ScolalyRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new UnauthorizedException(
        'Session absente ou expirée : reconnectez-vous pour continuer.',
      );
    }
    request.userId = session.user.id;
    if (rule.kind === 'authenticated') return true;

    const access = await this.resolver.resolve(
      session.user.id,
      session.session.activeOrganisationId ?? null,
    );
    if (!access?.permissions.has(rule.permission)) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit d'effectuer cette action dans cette école. " +
          'Demandez à un administrateur de vous attribuer le rôle adapté.',
      );
    }
    request.access = access;
    return true;
  }
}
