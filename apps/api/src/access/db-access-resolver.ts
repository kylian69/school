import { Inject, Injectable } from '@nestjs/common';
import { isPermission, type Permission } from '@scolaly/contracts';
import {
  attributionsDuCompte,
  organisation,
  organisationModule,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import { doubleAuthentificationExigee, permissionsEffectives } from '@scolaly/domain';
import { eq } from 'drizzle-orm';
import { aujourdhui } from '../shared/dates.js';
import { DATABASE } from '../shared/tokens.js';
import type { Access, AccessResolver, Perimetre } from './access-resolver.js';

/**
 * Droits d'un compte dans l'école active de sa session, recalculés à chaque requête (RG-01-16) :
 * fiche de la personne dans l'école (RG-00-26), attributions en cours (RG-00-10, RG-00-11),
 * accès de l'école (RG-19-02) et modules actifs (RG-19-04). Tout est lu sous RLS.
 */
@Injectable()
export class DbAccessResolver implements AccessResolver {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(userId: string, activeOrganisationId: string | null): Promise<Access | null> {
    if (!activeOrganisationId) return null;
    return withOrganisation(this.db, activeOrganisationId, async (tx) => {
      const [ecole] = await tx
        .select({ acces: organisation.acces })
        .from(organisation)
        .where(eq(organisation.id, activeOrganisationId));
      const droits = await attributionsDuCompte(tx, userId);
      if (!ecole || !droits) return null;
      const modules = await tx
        .select({ module: organisationModule.module })
        .from(organisationModule)
        .where(eq(organisationModule.actif, true));

      const date = aujourdhui();
      const attributions = droits.attributions.map((a) => ({
        roleCode: a.roleCode,
        permissions: a.permissions,
        doubleAuthentificationRequise: a.doubleAuthentificationRequise,
        perimetre: { type: a.perimetreType, id: a.perimetreId },
        debut: a.debut,
        fin: a.fin,
      }));
      const effectives = permissionsEffectives(attributions, date);
      const perimetres = new Map<Permission, readonly Perimetre[]>();
      for (const [permission, liste] of effectives) {
        if (isPermission(permission)) perimetres.set(permission, liste);
      }
      return {
        userId,
        organisationId: activeOrganisationId,
        personneId: droits.personneId,
        permissions: new Set(perimetres.keys()),
        perimetres,
        doubleAuthentificationExigee: doubleAuthentificationExigee(attributions, date),
        modules: new Set(modules.map((m) => m.module)),
        acces: ecole.acces,
      };
    });
  }
}
