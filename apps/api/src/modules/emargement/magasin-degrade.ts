import type { PresenceEnCache, SeanceEnCache } from '@scolaly/contracts';
import {
  enregistrerPresenceDirecte,
  organisationDeSeance,
  seanceEtAttendus,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import type { Magasin } from './cache-emargement.js';

type Chargement = NonNullable<Awaited<ReturnType<typeof seanceEtAttendus>>> & {
  organisationId: string;
};

/**
 * Mode dégradé : la séance, les attendus et la présence sont lus et écrits dans PostgreSQL, dans le
 * contexte de l'école de la séance (RLS). Plus lent, mais l'émargement continue sans Valkey.
 */
export class MagasinDegrade implements Magasin {
  private chargement: Promise<Chargement | null> | undefined;

  constructor(private readonly db: Database) {}

  private charger(seanceId: string): Promise<Chargement | null> {
    this.chargement ??= (async () => {
      const organisationId = await organisationDeSeance(this.db, seanceId);
      if (!organisationId) return null;
      const trouve = await withOrganisation(this.db, organisationId, (tx) =>
        seanceEtAttendus(tx, seanceId),
      );
      return trouve ? { ...trouve, organisationId } : null;
    })();
    return this.chargement;
  }

  async seance(seanceId: string): Promise<SeanceEnCache | null> {
    const trouve = await this.charger(seanceId);
    if (!trouve) return null;
    return {
      organisationId: trouve.organisationId,
      libelle: trouve.seance.libelle,
      debut: trouve.seance.debut.getTime(),
      fin: trouve.seance.fin.getTime(),
      distanciel: trouve.seance.distanciel,
    };
  }

  async attendu(seanceId: string, userId: string): Promise<string | null> {
    const trouve = await this.charger(seanceId);
    return trouve?.attendus.find((a) => a.userId === userId)?.personneId ?? null;
  }

  async enregistrer(presence: PresenceEnCache) {
    const existante = await withOrganisation(this.db, presence.organisationId, (tx) =>
      enregistrerPresenceDirecte(tx, presence),
    );
    return existante
      ? { scanneLe: existante.scanneLe.toISOString(), rejoue: existante.rejoue }
      : null;
  }
}
