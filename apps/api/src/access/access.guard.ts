import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolePlateforme } from '@scolaly/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth.js';
import { AUTH } from '../shared/tokens.js';
import { ACCESS_RESOLVER, type Access, type AccessResolver } from './access-resolver.js';
import { ACCESS_RULE, MODULE_REQUIS, type AccessRule } from './access.decorators.js';
import { PLATEFORME_MEMBRES, type PlateformeMembres } from './plateforme-membres.js';

export type ScolalyRequest = FastifyRequest & {
  access?: Access;
  userId?: string;
  rolePlateforme?: RolePlateforme;
};

const METHODES_LECTURE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function accessRuleOf(reflector: Reflector, context: ExecutionContext) {
  return reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/**
 * Vérifie la session, puis selon la route : la permission dans l'organisation active, l'accès de
 * l'école et ses modules (RG-00-10, RG-01-16, RG-19-02, RG-19-04), ou le rôle dans l'équipe
 * Scolaly pour la console de la plateforme.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
    @Optional() @Inject(PLATEFORME_MEMBRES) private readonly membres?: PlateformeMembres,
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

    if (rule.kind === 'plateforme') {
      const role = this.membres ? await this.membres.roleDe(session.user.id) : null;
      if (!role || !rule.roles.includes(role)) {
        // La console n'existe pas pour qui n'en fait pas partie.
        throw new NotFoundException();
      }
      request.rolePlateforme = role;
      return true;
    }

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
    const module = this.reflector.getAllAndOverride<string | undefined>(MODULE_REQUIS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (module && !access.modules.has(module)) {
      // Un module inactif ne répond pas (RG-19-04).
      throw new NotFoundException();
    }
    if (access.acces === 'ferme') {
      throw new ForbiddenException(
        "L'accès de votre établissement à Scolaly est fermé. Contactez la direction de votre établissement.",
      );
    }
    if (access.acces === 'lecture_seule' && !METHODES_LECTURE.has(request.method)) {
      throw new ForbiddenException(
        'Votre établissement est en lecture seule : son abonnement est suspendu. ' +
          'Contactez la direction de votre établissement pour le rétablir.',
      );
    }
    request.access = access;
    return true;
  }
}
