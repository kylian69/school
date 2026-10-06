import { eq } from 'drizzle-orm';
import type { Database } from '../../src/client.js';
import { newId } from '../../src/ids.js';
import {
  anneeScolaire,
  attribution,
  invitation,
  role,
  rolePermission,
  demarrageEtape,
  etablissement,
  fermeture,
  fermetureEtablissement,
  importPersonnes,
  organisationModule,
  periode,
  personne,
  presence,
  seance,
  seanceAttendu,
  competence,
  competenceModule,
  formation,
  formationEtablissement,
  maquetteBloc,
  maquetteModule,
  maquetteUe,
  maquetteVersion,
  maquetteVersionRegle,
  niveauMaitrise,
  regleParticuliere,
  groupeEleves,
  groupeMembre,
  groupePromotion,
  inscription,
  inscriptionStatut,
  promotion,
  affectation,
  affectationGroupe,
  salle,
  seancePublic,
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

async function insertSeance(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(seance).values({
    id,
    organisationId,
    libelle: 'Séance fictive',
    debut: new Date('2026-10-05T08:00:00Z'),
    fin: new Date('2026-10-05T10:00:00Z'),
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

async function insertFormation(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(formation).values({
    id,
    organisationId,
    intitule: 'Bachelor fictif',
    type: 'bachelor',
    niveau: 6,
    dureeAnnees: 3,
    modes: ['initial'],
  });
  return id;
}

async function insertVersion(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  const formationId = await insertFormation(db, organisationId);
  await db
    .insert(maquetteVersion)
    .values({ id, organisationId, formationId, numero: 1, regles: {} });
  return id;
}

async function insertBloc(db: Database, organisationId: string, versionId: string) {
  const id = newId();
  await db
    .insert(maquetteBloc)
    .values({ id, organisationId, versionId, code: 'BC1', intitule: 'Bloc fictif', ordre: 0 });
  return id;
}

async function insertModule(db: Database, organisationId: string, versionId: string) {
  const ueId = newId();
  await db
    .insert(maquetteUe)
    .values({ id: ueId, organisationId, versionId, code: 'UE1', intitule: 'UE fictive', ordre: 0 });
  const id = newId();
  await db.insert(maquetteModule).values({
    id,
    organisationId,
    versionId,
    ueId,
    code: 'M1',
    intitule: 'Module fictif',
    ordre: 0,
  });
  return id;
}

async function insertCompetence(db: Database, organisationId: string, versionId: string) {
  const id = newId();
  const blocId = await insertBloc(db, organisationId, versionId);
  await db.insert(competence).values({
    id,
    organisationId,
    versionId,
    blocId,
    code: 'C1',
    intitule: 'Compétence',
    ordre: 0,
  });
  return id;
}

async function insertRegle(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(regleParticuliere).values({
    id,
    organisationId,
    libelle: 'Bonus fictif',
    type: 'points_jury',
    parametres: { type: 'points_jury', maximum: 0.3, seuils: [] },
  });
  return id;
}

async function insertPromotion(db: Database, organisationId: string): Promise<string> {
  const versionId = await insertVersion(db, organisationId);
  const [version] = await db
    .select()
    .from(maquetteVersion)
    .where(eq(maquetteVersion.id, versionId));
  const etablissementId = newId();
  await db.insert(etablissement).values({ id: etablissementId, organisationId, nom: 'Campus' });
  const id = newId();
  await db.insert(promotion).values({
    id,
    organisationId,
    formationId: version?.formationId ?? '',
    versionId,
    anneeFormation: 1,
    anneeScolaireId: await insertAnnee(db, organisationId),
    etablissementId,
    libelle: 'Promotion fictive',
    dateDebut: '2026-09-01',
    dateFin: '2027-06-30',
  });
  return id;
}

async function insertInscription(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(inscription).values({
    id,
    organisationId,
    personneId: await insertPersonne(db, organisationId),
    promotionId: await insertPromotion(db, organisationId),
    dateEntree: '2026-09-01',
  });
  return id;
}

async function insertGroupe(db: Database, organisationId: string): Promise<string> {
  const id = newId();
  await db.insert(groupeEleves).values({ id, organisationId, libelle: 'TD 1', type: 'td' });
  return id;
}

async function insertAffectation(db: Database, organisationId: string): Promise<string> {
  const promotionId = await insertPromotion(db, organisationId);
  const [promo] = await db.select().from(promotion).where(eq(promotion.id, promotionId));
  const id = newId();
  await db.insert(affectation).values({
    id,
    organisationId,
    personneId: await insertPersonne(db, organisationId),
    moduleId: await insertModule(db, organisationId, promo?.versionId ?? ''),
    promotionId,
  });
  return id;
}

export const sampleRows: Record<string, ScopedTableSample> = {
  formation: {
    insert: async (db, organisationId) => {
      await insertFormation(db, organisationId);
    },
  },
  formation_etablissement: {
    insert: async (db, organisationId) => {
      const etablissementId = newId();
      await db.insert(etablissement).values({ id: etablissementId, organisationId, nom: 'Campus' });
      await db.insert(formationEtablissement).values({
        organisationId,
        formationId: await insertFormation(db, organisationId),
        etablissementId,
      });
    },
  },
  maquette_version: {
    insert: async (db, organisationId) => {
      await insertVersion(db, organisationId);
    },
  },
  maquette_bloc: {
    insert: async (db, organisationId) => {
      await insertBloc(db, organisationId, await insertVersion(db, organisationId));
    },
  },
  maquette_ue: {
    insert: async (db, organisationId) => {
      await insertModule(db, organisationId, await insertVersion(db, organisationId));
    },
  },
  maquette_module: {
    insert: async (db, organisationId) => {
      await insertModule(db, organisationId, await insertVersion(db, organisationId));
    },
  },
  competence: {
    insert: async (db, organisationId) => {
      await insertCompetence(db, organisationId, await insertVersion(db, organisationId));
    },
  },
  competence_module: {
    insert: async (db, organisationId) => {
      const versionId = await insertVersion(db, organisationId);
      await db.insert(competenceModule).values({
        organisationId,
        competenceId: await insertCompetence(db, organisationId, versionId),
        moduleId: await insertModule(db, organisationId, versionId),
      });
    },
  },
  niveau_maitrise: {
    insert: async (db, organisationId) => {
      await db
        .insert(niveauMaitrise)
        .values({ organisationId, libelle: 'Acquis', couleur: '#16A34A', ordre: 1, valide: true });
    },
  },
  regle_particuliere: {
    insert: async (db, organisationId) => {
      await insertRegle(db, organisationId);
    },
  },
  maquette_version_regle: {
    insert: async (db, organisationId) => {
      await db.insert(maquetteVersionRegle).values({
        organisationId,
        versionId: await insertVersion(db, organisationId),
        regleId: await insertRegle(db, organisationId),
        libelle: 'Points de jury',
        type: 'points_jury',
        parametres: { type: 'points_jury', maximum: 0.3, seuils: [] },
      });
    },
  },
  promotion: {
    insert: async (db, organisationId) => {
      await insertPromotion(db, organisationId);
    },
  },
  groupe_eleves: {
    insert: async (db, organisationId) => {
      await insertGroupe(db, organisationId);
    },
  },
  groupe_promotion: {
    insert: async (db, organisationId) => {
      await db.insert(groupePromotion).values({
        organisationId,
        groupeId: await insertGroupe(db, organisationId),
        promotionId: await insertPromotion(db, organisationId),
      });
    },
  },
  inscription: {
    insert: async (db, organisationId) => {
      await insertInscription(db, organisationId);
    },
  },
  inscription_statut: {
    insert: async (db, organisationId) => {
      await db.insert(inscriptionStatut).values({
        organisationId,
        inscriptionId: await insertInscription(db, organisationId),
        statut: 'initial',
        debut: '2026-09-01',
      });
    },
  },
  groupe_membre: {
    insert: async (db, organisationId) => {
      await db.insert(groupeMembre).values({
        organisationId,
        groupeId: await insertGroupe(db, organisationId),
        inscriptionId: await insertInscription(db, organisationId),
        debut: '2026-09-01',
      });
    },
  },
  seance_public: {
    insert: async (db, organisationId) => {
      await db.insert(seancePublic).values({
        organisationId,
        seanceId: await insertSeance(db, organisationId),
        promotionId: await insertPromotion(db, organisationId),
      });
    },
  },
  salle: {
    insert: async (db, organisationId) => {
      const etablissementId = newId();
      await db.insert(etablissement).values({ id: etablissementId, organisationId, nom: 'Campus' });
      await db.insert(salle).values({ organisationId, etablissementId, nom: 'Salle 101' });
    },
  },
  affectation: {
    insert: async (db, organisationId) => {
      await insertAffectation(db, organisationId);
    },
  },
  affectation_groupe: {
    insert: async (db, organisationId) => {
      await db.insert(affectationGroupe).values({
        organisationId,
        affectationId: await insertAffectation(db, organisationId),
        groupeId: await insertGroupe(db, organisationId),
      });
    },
  },
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
  demarrage_etape: {
    insert: async (db, organisationId) => {
      await db
        .insert(demarrageEtape)
        .values({ organisationId, etape: 'apparence', choix: 'sautee' });
    },
  },
  seance: {
    insert: async (db, organisationId) => {
      await insertSeance(db, organisationId);
    },
  },
  seance_attendu: {
    insert: async (db, organisationId) => {
      await db.insert(seanceAttendu).values({
        organisationId,
        seanceId: await insertSeance(db, organisationId),
        personneId: await insertPersonne(db, organisationId),
      });
    },
  },
  presence: {
    insert: async (db, organisationId) => {
      await db.insert(presence).values({
        organisationId,
        seanceId: await insertSeance(db, organisationId),
        personneId: await insertPersonne(db, organisationId),
        scanneLe: new Date('2026-10-05T08:01:00Z'),
        mode: 'qr',
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
  import_personnes: {
    insert: async (db, organisationId) => {
      await db.insert(importPersonnes).values({
        organisationId,
        type: 'apprenants',
        fichierCle: 'organisations/x/imports/y',
        fichierNom: 'apprenants.csv',
        fichierType: 'csv',
        colonnes: ['Nom'],
        correspondance: { Nom: 'nom' },
        lignes: 1,
        expireLe: new Date(Date.now() + 86_400_000),
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
