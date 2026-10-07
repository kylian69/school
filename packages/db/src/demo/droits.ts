import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { initialiserRolesParDefaut, type DefinitionRole } from '../roles-par-defaut.js';
import {
  attribution,
  groupeMembre,
  groupePromotion,
  inscription,
  inscriptionStatut,
  personne,
  promotion,
  role,
} from '../schema/index.js';
import type { DemoDataset } from './dataset.js';

/**
 * Rôles par défaut des écoles de démonstration, puis une fiche rattachée à chaque compte de
 * démonstration, avec son rôle (périmètre : l'organisation, ou le premier campus pour un rôle
 * d'établissement). Idempotent. Écrit avec le rôle propriétaire.
 */
export async function seedDemoDroits(
  owner: Database,
  dataset: DemoDataset,
  roles: readonly DefinitionRole[],
  comptes: ReadonlyMap<string, string>,
): Promise<void> {
  for (const org of dataset.organisations) {
    if (org.id) await initialiserRolesParDefaut(owner, org.id, roles);
  }
  for (const compte of dataset.comptes) {
    const organisationId = dataset.organisations[compte.organisationIndex]?.id;
    const userId = comptes.get(compte.email);
    const definition = roles.find((r) => r.code === compte.role);
    if (!organisationId || !userId || !definition) continue;

    const [existante] = await owner
      .select({ id: personne.id })
      .from(personne)
      .where(and(eq(personne.organisationId, organisationId), eq(personne.email, compte.email)));
    if (existante) continue;

    const [fiche] = await owner
      .insert(personne)
      .values({
        organisationId,
        nom: compte.name,
        prenom: 'Démo',
        email: compte.email,
        userId,
        compteEtat: 'actif',
        conditionsAccepteesLe: new Date('2026-09-01T08:00:00Z'),
      })
      .returning({ id: personne.id });
    const [leRole] = await owner
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.organisationId, organisationId), eq(role.code, compte.role)));
    const campus = dataset.etablissements.find((e) => e.organisationId === organisationId);
    const parEtablissement = definition.perimetre === 'etablissement';
    if (!fiche || !leRole) continue;
    await owner.insert(attribution).values({
      organisationId,
      personneId: fiche.id,
      roleId: leRole.id,
      perimetreType: parEtablissement
        ? 'etablissement'
        : definition.perimetre === 'soi'
          ? 'soi'
          : 'organisation',
      perimetreId: parEtablissement ? (campus?.id ?? null) : null,
      debut: '2026-09-01',
    });
    // Le compte apprenant suit la première promotion de son école (I3.2), dans son premier TD.
    if (compte.role === 'apprenant') {
      const [promo] = await owner
        .select()
        .from(promotion)
        .where(eq(promotion.organisationId, organisationId))
        .orderBy(promotion.libelle)
        .limit(1);
      if (!promo) continue;
      const [nouvelle] = await owner
        .insert(inscription)
        .values({
          organisationId,
          personneId: fiche.id,
          promotionId: promo.id,
          dateEntree: promo.dateDebut,
        })
        .returning({ id: inscription.id });
      if (!nouvelle) continue;
      await owner.insert(inscriptionStatut).values({
        organisationId,
        inscriptionId: nouvelle.id,
        statut: 'apprenti',
        debut: promo.dateDebut,
      });
      const [td] = await owner
        .select({ id: groupePromotion.groupeId })
        .from(groupePromotion)
        .where(eq(groupePromotion.promotionId, promo.id))
        .limit(1);
      if (td) {
        await owner.insert(groupeMembre).values({
          organisationId,
          groupeId: td.id,
          inscriptionId: nouvelle.id,
          debut: promo.dateDebut,
        });
      }
    }
  }
}
