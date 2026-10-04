import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { withOrganisation, type Database } from '@scolaly/db';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { DATABASE } from '../shared/tokens.js';
import type { ScolalyRequest } from './access.guard.js';
import { RequestContext } from './request-context.js';

/**
 * Deuxième barrière (architecture section 3) : une route protégée par permission s'exécute
 * dans une transaction limitée à l'organisation active (SET LOCAL), lue par la RLS.
 */
@Injectable()
export class OrganisationContextInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const access = context.switchToHttp().getRequest<ScolalyRequest>().access;
    if (!access) return next.handle();
    return from(
      withOrganisation(this.db, access.organisationId, (tx) =>
        RequestContext.run({ access, tx }, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        ),
      ),
    );
  }
}
