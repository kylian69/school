import { Inject, Injectable } from '@nestjs/common';
import type { SeanceProche } from '@scolaly/contracts';
import {
  personne,
  seance,
  seanceAttenduCalcule,
  seanceIntervenant,
  type Transaction,
} from '@scolaly/db';
import { badgeModifie } from '@scolaly/domain';
import { and, asc, eq, gt, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import type { Env } from '../../config/env.js';
import { dureeBadgeModifie } from '../../shared/badge-modifie.js';
import { ENV } from '../../shared/tokens.js';

const HEURE = 3600_000;

/** RG-04-01 : séances dont la personne est l'un des intervenants. */
function seancesDe(tx: Transaction, personneId: string) {
  return tx
    .select({ id: seanceIntervenant.seanceId })
    .from(seanceIntervenant)
    .where(and(eq(seanceIntervenant.personneId, personneId), isNull(seanceIntervenant.deletedAt)));
}

/** Séances proches : celles de l'intervenant, de toute l'école, ou où l'apprenant est attendu. */
@Injectable()
export class SeancesService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async proches(tx: Transaction, filtre: SQL | undefined): Promise<SeanceProche[]> {
    const maintenant = Date.now();
    const lignes = await tx
      .selectDistinct({
        id: seance.id,
        libelle: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        distanciel: seance.distanciel,
        modifieeLe: seance.modifieeLe,
      })
      .from(seance)
      .leftJoin(
        seanceAttenduCalcule,
        and(
          eq(seanceAttenduCalcule.organisationId, seance.organisationId),
          eq(seanceAttenduCalcule.seanceId, seance.id),
        ),
      )
      .where(
        and(
          isNull(seance.deletedAt),
          // RG-04-13 : les brouillons ne sont vus que de la pédagogie ; une séance annulée n'a pas d'appel.
          eq(seance.statut, 'publiee'),
          gt(seance.fin, new Date(maintenant - HEURE)),
          lt(seance.debut, new Date(maintenant + 12 * HEURE)),
          filtre,
        ),
      )
      .orderBy(asc(seance.debut));
    const noms = await this.intervenants(
      tx,
      lignes.map((l) => l.id),
    );
    const dureeBadge = await dureeBadgeModifie(tx, this.env);
    return lignes.map((l) => ({
      id: l.id,
      libelle: l.libelle,
      debut: l.debut.toISOString(),
      fin: l.fin.toISOString(),
      distanciel: l.distanciel,
      intervenant: noms.get(l.id)?.join(', ') ?? null,
      modifiee: badgeModifie(l.modifieeLe, new Date(maintenant), dureeBadge),
    }));
  }

  /** RG-04-01 : noms des intervenants de chaque séance, par ordre alphabétique. */
  private async intervenants(tx: Transaction, seanceIds: readonly string[]) {
    const noms = new Map<string, string[]>();
    if (seanceIds.length === 0) return noms;
    const lignes = await tx
      .select({
        seanceId: seanceIntervenant.seanceId,
        prenom: personne.prenom,
        nom: personne.nom,
      })
      .from(seanceIntervenant)
      .innerJoin(
        personne,
        and(
          eq(personne.organisationId, seanceIntervenant.organisationId),
          eq(personne.id, seanceIntervenant.personneId),
        ),
      )
      .where(
        and(
          inArray(seanceIntervenant.seanceId, [...seanceIds]),
          isNull(seanceIntervenant.deletedAt),
        ),
      )
      .orderBy(asc(personne.nom), asc(personne.prenom));
    for (const l of lignes)
      noms.set(l.seanceId, [...(noms.get(l.seanceId) ?? []), `${l.prenom} ${l.nom}`]);
    return noms;
  }

  /** Pour l'intervenant : ses séances ; avec un périmètre « toute l'école » : toutes. */
  aAnimer(tx: Transaction, access: Access) {
    const ecole = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    return this.proches(
      tx,
      ecole ? undefined : inArray(seance.id, seancesDe(tx, access.personneId)),
    );
  }

  /** Pour l'apprenant : les séances où il est attendu. */
  aEmarger(tx: Transaction, access: Access) {
    return this.proches(tx, eq(seanceAttenduCalcule.personneId, access.personneId));
  }
}
