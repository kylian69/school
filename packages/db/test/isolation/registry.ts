import type { Database } from '../../src/client.js';
import { newId } from '../../src/ids.js';
import { anneeScolaire, etablissement, periode, personne } from '../../src/schema/index.js';
import { auditEvenement, outboxEvenement } from '../../src/schema/journal.js';

/**
 * Pour chaque table cloisonnée, une fonction qui insère au moins une ligne valide pour une
 * organisation (avec ses parents). Le test d'isolation échoue si une table n'y figure pas :
 * toute nouvelle table doit ajouter son entrée ici.
 */
export type SampleRowFactory = (db: Database, organisationId: string) => Promise<void>;

export interface ScopedTableSample {
  insert: SampleRowFactory;
  /** Table en ajout seul : le rôle applicatif n'a ni UPDATE ni DELETE. */
  appendOnly?: boolean;
}

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

export const sampleRows: Record<string, ScopedTableSample> = {
  etablissement: {
    insert: async (db, organisationId) => {
      await db.insert(etablissement).values({ organisationId, nom: 'Campus fictif' });
    },
  },
  annee_scolaire: {
    insert: async (db, organisationId) => {
      await insertAnnee(db, organisationId);
    },
  },
  periode: {
    insert: async (db, organisationId) => {
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
  },
  personne: {
    insert: async (db, organisationId) => {
      await db.insert(personne).values({
        organisationId,
        nom: 'Fictif',
        prenom: 'Camille',
        email: `camille.${newId()}@exemple.test`,
      });
    },
  },
  audit_evenement: {
    appendOnly: true,
    insert: async (db, organisationId) => {
      await db.insert(auditEvenement).values({
        organisationId,
        action: 'test.isolation',
        objetType: 'personne',
      });
    },
  },
  outbox_evenement: {
    appendOnly: true,
    insert: async (db, organisationId) => {
      await db
        .insert(outboxEvenement)
        .values({ organisationId, type: 'test.isolation', charge: {} });
    },
  },
};
