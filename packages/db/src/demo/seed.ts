import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  anneeScolaire,
  etablissement,
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
    for (let i = 0; i < dataset.personnes.length; i += 500) {
      await tx.insert(personne).values(dataset.personnes.slice(i, i + 500));
    }
  });
  return true;
}
