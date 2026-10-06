import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  anneeScolaire,
  etablissement,
  formation,
  inscription,
  inscriptionStatut,
  maquetteUe,
  maquetteVersion,
  promotion,
} from './schema/index.js';

/**
 * Outils d'administration (rôle propriétaire, hors RLS) pour les scripts techniques : preuve de
 * charge et séances de démonstration. Ils ne servent jamais aux traitements des écoles.
 */

/** Promotion technique d'une école, créée une fois avec sa formation fictive, publiée. */
export async function promotionTechnique(
  owner: Database,
  organisationId: string,
  libelle: string,
): Promise<string> {
  const [existante] = await owner
    .select({ id: promotion.id })
    .from(promotion)
    .where(and(eq(promotion.organisationId, organisationId), eq(promotion.libelle, libelle)));
  if (existante) return existante.id;
  // Une année et un campus techniques, propres à cette promotion, couvrent toutes les dates.
  const [campus] = await owner
    .insert(etablissement)
    .values({ organisationId, nom: `${libelle} (campus)` })
    .returning();
  const [annee] = await owner
    .insert(anneeScolaire)
    .values({ organisationId, libelle, dateDebut: '2020-09-01', dateFin: '2099-08-31' })
    .returning();
  const [f] = await owner
    .insert(formation)
    .values({
      organisationId,
      intitule: libelle,
      type: 'autre',
      niveau: 5,
      dureeAnnees: 1,
      modes: ['initial'],
    })
    .returning();
  if (!campus || !annee || !f) throw new Error('Promotion technique impossible.');
  const [version] = await owner
    .insert(maquetteVersion)
    .values({
      organisationId,
      formationId: f.id,
      numero: 1,
      statut: 'publiee',
      publieeLe: new Date(),
      regles: {},
    })
    .returning();
  if (!version) throw new Error('Promotion technique impossible.');
  await owner
    .insert(maquetteUe)
    .values({ organisationId, versionId: version.id, code: 'UE', intitule: libelle, ordre: 0 });
  const [promo] = await owner
    .insert(promotion)
    .values({
      organisationId,
      formationId: f.id,
      versionId: version.id,
      anneeFormation: 1,
      anneeScolaireId: annee.id,
      etablissementId: campus.id,
      libelle,
      dateDebut: annee.dateDebut,
      dateFin: annee.dateFin,
    })
    .returning();
  if (!promo) throw new Error('Promotion technique impossible.');
  return promo.id;
}

/** Inscrit les fiches qui ne le sont pas encore, au statut initial, depuis le début de la promotion. */
export async function inscrireManquants(
  owner: Database,
  organisationId: string,
  promotionId: string,
  personneIds: readonly string[],
): Promise<void> {
  const [promo] = await owner.select().from(promotion).where(eq(promotion.id, promotionId));
  if (!promo) throw new Error('Promotion introuvable.');
  const deja = new Set(
    (
      await owner
        .select({ personneId: inscription.personneId })
        .from(inscription)
        .where(and(eq(inscription.promotionId, promotionId), isNull(inscription.deletedAt)))
    ).map((i) => i.personneId),
  );
  const manquants = personneIds.filter((id) => !deja.has(id));
  for (let debut = 0; debut < manquants.length; debut += 1000) {
    const lot = manquants.slice(debut, debut + 1000);
    const crees = await owner
      .insert(inscription)
      .values(
        lot.map((personneId) => ({
          organisationId,
          personneId,
          promotionId,
          dateEntree: promo.dateDebut,
        })),
      )
      .returning({ id: inscription.id });
    await owner.insert(inscriptionStatut).values(
      crees.map((c) => ({
        organisationId,
        inscriptionId: c.id,
        statut: 'initial' as const,
        debut: promo.dateDebut,
      })),
    );
  }
}
