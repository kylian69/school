import type { Database } from '../../src/client.js';
import { newId } from '../../src/ids.js';
import {
  anneeScolaire,
  attribution,
  invitation,
  role,
  rolePermission,
  etablissement,
  fermeture,
  fermetureEtablissement,
  organisationModule,
  periode,
  personne,
} from '../../src/schema/index.js';
import { auditEvenement, outboxEvenement } from '../../src/schema/journal.js';

/**
 * Pour chaque table cloisonnée, une fonction qui insère au moins une ligne valide pour une
 * organisation (avec ses parents). Le test d'isolation échoue si une table n'y figure pas :
 * toute nouvelle table doit ajouter son entrée ici.
 */
export type SampleRowFactory = (db: Database, organisationId: string) => Promise<void>;

export interface ScopedTableSample {
  insert: SampleRowFactory;
  /**
   * Droits du rôle applicatif : complets (par défaut), ajout seul (ni UPDATE ni DELETE) ou
   * lecture seule (la table est gérée par la console de la plateforme, ADR 0004).
   */
  appAccess?: 'full' | 'append-only' | 'read-only';
}

async function insertPersonne(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(personne).values({
    id,
    organisationId,
    nom: 'Fictif',
    prenom: 'Camille',
    email: `camille.${id}@exemple.test`,
  });
  return id;
}

async function insertRole(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(role).values({ id, organisationId, libelle: 'Rôle personnalisé' });
  return id;
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
  fermeture: {
    insert: async (db, organisationId) => {
      const anneeScolaireId = await insertAnnee(db, organisationId);
      await db.insert(fermeture).values({
        organisationId,
        anneeScolaireId,
        libelle: 'Vacances de la Toussaint',
        dateDebut: '2026-10-24',
        dateFin: '2026-11-01',
      });
    },
  },
  fermeture_etablissement: {
    insert: async (db, organisationId) => {
      const anneeScolaireId = await insertAnnee(db, organisationId);
      const fermetureId = newId();
      await db.insert(fermeture).values({
        id: fermetureId,
        organisationId,
        anneeScolaireId,
        libelle: 'Pont de l’Ascension',
        dateDebut: '2027-05-07',
        dateFin: '2027-05-07',
        type: 'autre',
      });
      const etablissementId = newId();
      await db.insert(etablissement).values({ id: etablissementId, organisationId, nom: 'Campus' });
      await db
        .insert(fermetureEtablissement)
        .values({ organisationId, fermetureId, etablissementId });
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
  role: {
    insert: async (db, organisationId) => {
      await insertRole(db, organisationId);
    },
  },
  role_permission: {
    insert: async (db, organisationId) => {
      const roleId = await insertRole(db, organisationId);
      await db.insert(rolePermission).values({ organisationId, roleId, permission: 'audit:lire' });
    },
  },
  invitation: {
    insert: async (db, organisationId) => {
      const personneId = await insertPersonne(db, organisationId);
      await db.insert(invitation).values({
        organisationId,
        personneId,
        jetonEmpreinte: newId(),
        email: 'camille@exemple.test',
        expireLe: new Date(Date.now() + 86_400_000),
      });
    },
  },
  attribution: {
    insert: async (db, organisationId) => {
      const personneId = await insertPersonne(db, organisationId);
      const roleId = await insertRole(db, organisationId);
      await db.insert(attribution).values({
        organisationId,
        personneId,
        roleId,
        perimetreType: 'organisation',
        debut: '2026-09-01',
      });
    },
  },
  audit_evenement: {
    appAccess: 'append-only',
    insert: async (db, organisationId) => {
      await db.insert(auditEvenement).values({
        organisationId,
        action: 'test.isolation',
        objetType: 'personne',
      });
    },
  },
  organisation_module: {
    appAccess: 'read-only',
    insert: async (db, organisationId) => {
      await db
        .insert(organisationModule)
        .values({ organisationId, module: 'notes', actif: true, origine: 'formule' });
    },
  },
  outbox_evenement: {
    appAccess: 'append-only',
    insert: async (db, organisationId) => {
      await db
        .insert(outboxEvenement)
        .values({ organisationId, type: 'test.isolation', charge: {} });
    },
  },
};
