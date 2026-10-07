import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  anneeScolaire,
  client,
  clientEtatEvenement,
  competence,
  competenceModule,
  contrat,
  entreprise,
  formation,
  formationEtablissement,
  groupeEleves,
  groupeMembre,
  groupePromotion,
  inscription,
  inscriptionStatut,
  promotion,
  salle,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  maquetteVersion,
  organisationModule,
  etablissement,
  fermeture,
  groupe,
  organisation,
  periode,
  personne,
} from '../schema/index.js';
import type { DemoDataset } from './dataset.js';

/**
 * Écrit le jeu de démonstration avec le rôle propriétaire (outil d'administration, hors RLS).
 * Idempotent : si le groupe de démonstration existe déjà, rien n'est écrit.
 */
export async function seedDemoDataset(owner: Database, dataset: DemoDataset): Promise<boolean> {
  const groupeId = dataset.groupe.id;
  if (!groupeId) throw new Error('Identifiant du groupe de démonstration manquant.');
  const existing = await owner
    .select({ id: groupe.id })
    .from(groupe)
    .where(eq(groupe.id, groupeId));
  if (existing.length > 0) return false;

  await owner.transaction(async (tx) => {
    await tx.insert(groupe).values(dataset.groupe);
    await tx.insert(organisation).values(dataset.organisations);
    await tx.insert(etablissement).values(dataset.etablissements);
    await tx.insert(anneeScolaire).values(dataset.annees);
    await tx.insert(periode).values(dataset.periodes);
    await tx.insert(fermeture).values(dataset.fermetures);
    await tx.insert(organisationModule).values(dataset.modules);
    await tx.insert(client).values(dataset.client);
    await tx.insert(contrat).values(dataset.contrat);
    await tx.insert(clientEtatEvenement).values(dataset.etatsClient);
    for (let i = 0; i < dataset.personnes.length; i += 500) {
      await tx.insert(personne).values(dataset.personnes.slice(i, i + 500));
    }
    const referentiel = dataset.referentiel;
    if (referentiel.formations.length > 0) {
      await tx.insert(formation).values(referentiel.formations);
      await tx.insert(formationEtablissement).values(referentiel.formationEtablissements);
      await tx.insert(maquetteVersion).values(referentiel.versions);
      await tx.insert(maquetteBloc).values(referentiel.blocs);
      await tx.insert(maquetteUe).values(referentiel.ues);
      await tx.insert(maquetteModule).values(referentiel.modules);
      await tx.insert(competence).values(referentiel.competences);
      await tx.insert(competenceModule).values(referentiel.competenceModules);
    }
    if (dataset.entreprises.length > 0) await tx.insert(entreprise).values(dataset.entreprises);
    const scolarite = dataset.scolarite;
    if (scolarite.salles.length > 0) await tx.insert(salle).values(scolarite.salles);
    if (scolarite.promotions.length > 0) {
      await tx.insert(promotion).values(scolarite.promotions);
      await tx.insert(groupeEleves).values(scolarite.groupes);
      await tx.insert(groupePromotion).values(scolarite.groupePromotions);
      await tx.insert(inscription).values(scolarite.inscriptions);
      await tx.insert(inscriptionStatut).values(scolarite.statuts);
      await tx.insert(groupeMembre).values(scolarite.membres);
    }
  });
  return true;
}
