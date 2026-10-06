import { Injectable } from '@nestjs/common';
import type { ChoixEtapeDemarrage, Demarrage, EtapeDemarrage } from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  demarrageEtape,
  enregistrerAudit,
  etablissement,
  fermeture,
  organisation,
  role,
  type Transaction,
} from '@scolaly/db';
import { etatDemarrage } from '@scolaly/domain';
import { and, count, countDistinct, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';

/** Liste de démarrage de l'école (E-01-01 ; US-01-01). */
@Injectable()
export class DemarrageService {
  async lire(tx: Transaction, access: Access): Promise<Demarrage> {
    const date = aujourdhui();
    const nombre = async (requete: Promise<{ n: number }[]>) => (await requete)[0]?.n ?? 0;
    const [ecole] = await tx
      .select({ couleur: organisation.couleurPrincipale, logo: organisation.logoEmpreinte })
      .from(organisation)
      .where(eq(organisation.id, access.organisationId));
    const constats = {
      etablissementsComplets: await nombre(
        tx
          .select({ n: count() })
          .from(etablissement)
          .where(
            and(
              eq(etablissement.statut, 'actif'),
              isNull(etablissement.deletedAt),
              isNotNull(etablissement.adresseLigne1),
              isNotNull(etablissement.codePostal),
              isNotNull(etablissement.ville),
            ),
          ),
      ),
      annees: await nombre(
        tx.select({ n: count() }).from(anneeScolaire).where(isNull(anneeScolaire.deletedAt)),
      ),
      fermetures: await nombre(
        tx.select({ n: count() }).from(fermeture).where(isNull(fermeture.deletedAt)),
      ),
      couleur: Boolean(ecole?.couleur),
      logo: Boolean(ecole?.logo),
      roles: await nombre(tx.select({ n: count() }).from(role).where(isNull(role.deletedAt))),
      personnesAvecRole: await nombre(
        tx
          .select({ n: countDistinct(attribution.personneId) })
          .from(attribution)
          .where(
            and(
              isNull(attribution.deletedAt),
              lte(attribution.debut, date),
              or(isNull(attribution.fin), gt(attribution.fin, date)),
            ),
          ),
      ),
    };
    const choix = await tx
      .select({ etape: demarrageEtape.etape, choix: demarrageEtape.choix })
      .from(demarrageEtape);
    const etat = etatDemarrage(constats, Object.fromEntries(choix.map((c) => [c.etape, c.choix])));
    return { ...etat, constats };
  }

  async choisir(
    tx: Transaction,
    access: Access,
    etape: EtapeDemarrage,
    { choix }: ChoixEtapeDemarrage,
    adresseIp: string,
  ): Promise<Demarrage> {
    const [avant] = await tx
      .select({ choix: demarrageEtape.choix })
      .from(demarrageEtape)
      .where(eq(demarrageEtape.etape, etape));
    if (choix === null) {
      await tx.delete(demarrageEtape).where(eq(demarrageEtape.etape, etape));
    } else {
      await tx
        .insert(demarrageEtape)
        .values({ organisationId: access.organisationId, etape, choix, createdBy: access.userId })
        .onConflictDoUpdate({
          target: [demarrageEtape.organisationId, demarrageEtape.etape],
          set: { choix, updatedBy: access.userId },
        });
    }
    await enregistrerAudit(tx, {
      action: 'demarrage.etape',
      objetType: 'demarrage_etape',
      auteurId: access.userId,
      adresseIp,
      avant: { etape, choix: avant?.choix ?? null },
      apres: { etape, choix },
    });
    return this.lire(tx, access);
  }
}
