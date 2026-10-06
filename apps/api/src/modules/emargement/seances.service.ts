import { Injectable } from '@nestjs/common';
import type { SeanceProche } from '@scolaly/contracts';
import { personne, seance, seanceAttenduCalcule, type Transaction } from '@scolaly/db';
import { and, asc, eq, gt, isNull, lt, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

const HEURE = 3600_000;

/** Séances proches : celles de l'intervenant, de toute l'école, ou où l'apprenant est attendu. */
@Injectable()
export class SeancesService {
  async proches(tx: Transaction, filtre: SQL | undefined): Promise<SeanceProche[]> {
    const maintenant = Date.now();
    const lignes = await tx
      .selectDistinct({
        id: seance.id,
        libelle: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        distanciel: seance.distanciel,
        prenom: personne.prenom,
        nom: personne.nom,
      })
      .from(seance)
      .leftJoin(
        personne,
        and(
          eq(personne.organisationId, seance.organisationId),
          eq(personne.id, seance.intervenantId),
        ),
      )
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
          gt(seance.fin, new Date(maintenant - HEURE)),
          lt(seance.debut, new Date(maintenant + 12 * HEURE)),
          filtre,
        ),
      )
      .orderBy(asc(seance.debut));
    return lignes.map((l) => ({
      id: l.id,
      libelle: l.libelle,
      debut: l.debut.toISOString(),
      fin: l.fin.toISOString(),
      distanciel: l.distanciel,
      intervenant: l.nom ? `${l.prenom} ${l.nom}` : null,
    }));
  }

  /** Pour l'intervenant : ses séances ; avec un périmètre « toute l'école » : toutes. */
  aAnimer(tx: Transaction, access: Access) {
    const ecole = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    return this.proches(tx, ecole ? undefined : eq(seance.intervenantId, access.personneId));
  }

  /** Pour l'apprenant : les séances où il est attendu. */
  aEmarger(tx: Transaction, access: Access) {
    return this.proches(tx, eq(seanceAttenduCalcule.personneId, access.personneId));
  }
}
