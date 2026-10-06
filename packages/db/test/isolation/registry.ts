import type { Database } from '../../src/client.js';
import { newId } from '../../src/ids.js';
import { anneeScolaire, etablissement, periode, personne } from '../../src/schema/index.js';

/**
 * Pour chaque table cloisonnée, une fonction qui insère au moins une ligne valide pour une
 * organisation (avec ses parents). Le test d'isolation échoue si une table n'y figure pas :
 * toute nouvelle table doit ajouter son entrée ici.
 */
export type SampleRowFactory = (db: Database, organisationId: string) => Promise<void>;

async function insertAnnee(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(anneeScolaire).values({
    id,
    organisationId,
    libelle: '2026-2027',
    dateDebut: '2026-09-01',
    dateFin: '2027-08-31',
  });
  return id;
}

export const sampleRows: Record<string, SampleRowFactory> = {
  etablissement: async (db, organisationId) => {
    await db.insert(etablissement).values({ organisationId, nom: 'Campus fictif' });
  },
  annee_scolaire: async (db, organisationId) => {
    await insertAnnee(db, organisationId);
  },
  periode: async (db, organisationId) => {
    const anneeScolaireId = await insertAnnee(db, organisationId);
    await db.insert(periode).values({
      organisationId,
      anneeScolaireId,
      libelle: 'S1',
      dateDebut: '2026-09-01',
      dateFin: '2027-01-31',
      ordre: 1,
    });
  },
  personne: async (db, organisationId) => {
    await db.insert(personne).values({
      organisationId,
      nom: 'Fictif',
      prenom: 'Camille',
      email: `camille.${newId()}@exemple.test`,
    });
  },
};
