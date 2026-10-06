import type { PresenceEnCache, SeanceEnCache } from '@scolaly/contracts';
import {
  attenduDeSeance,
  enregistrerPresenceDirecte,
  organisationDeSeance,
  seance,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Magasin } from './cache-emargement.js';

/**
 * Mode dégradé : la séance, l'attendu et la présence sont lus et écrits dans PostgreSQL, dans le
 * contexte de l'école de la séance (RLS). Chaque scan ne lit que sa séance et sa propre fiche.
 */
export class MagasinDegrade implements Magasin {
  private seanceChargee: Promise<SeanceEnCache | null> | undefined;

  constructor(private readonly db: Database) {}

  seance(seanceId: string): Promise<SeanceEnCache | null> {
    this.seanceChargee ??= (async () => {
      const organisationId = await organisationDeSeance(this.db, seanceId);
      if (!organisationId) return null;
      const [ligne] = await withOrganisation(this.db, organisationId, (tx) =>
        tx
          .select()
          .from(seance)
          .where(and(eq(seance.id, seanceId), isNull(seance.deletedAt))),
      );
      return ligne
        ? {
            organisationId,
            libelle: ligne.libelle,
            debut: ligne.debut.getTime(),
            fin: ligne.fin.getTime(),
            distanciel: ligne.distanciel,
          }
        : null;
    })();
    return this.seanceChargee;
  }

  async attendu(seanceId: string, userId: string): Promise<string | null> {
    const trouvee = await this.seance(seanceId);
    if (!trouvee) return null;
    return withOrganisation(this.db, trouvee.organisationId, (tx) =>
      attenduDeSeance(tx, seanceId, userId),
    );
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
