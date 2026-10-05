import type { InferInsertModel } from 'drizzle-orm';
import type {
  anneeScolaire,
  client,
  clientEtatEvenement,
  contrat,
  organisationModule,
  etablissement,
  fermeture,
  groupe,
  organisation,
  periode,
  personne,
} from '../schema/index.js';
import { SeededRandom } from './random.js';

/**
 * Jeu de démonstration (plan, section 5) : entièrement fictif. Aucune enseigne, école, personne
 * ni adresse réelle ; ville inventée (« Lumerac »), domaine réservé `.test`, identifiants
 * officiels (UAI, SIRET, NDA) laissés vides. Il grandit à chaque incrément.
 */
export const DEMO_SEED = 20_261_101;
const CREATED_AT = new Date('2026-09-01T08:00:00Z');
export const DEMO_EMAIL_DOMAIN = 'demo.scolaly.test';

const PRENOMS = [
  'Camille',
  'Léa',
  'Hugo',
  'Inès',
  'Lucas',
  'Chloé',
  'Nathan',
  'Manon',
  'Yanis',
  'Jade',
  'Théo',
  'Sarah',
  'Louis',
  'Lina',
  'Adam',
  'Emma',
  'Noah',
  'Zoé',
  'Rayan',
  'Clara',
  'Sacha',
  'Maëlys',
  'Enzo',
  'Anaïs',
  'Mathis',
  'Lou',
  'Samuel',
  'Nora',
  'Malo',
  'Alix',
] as const;
const NOMS = [
  'Martin',
  'Bernard',
  'Durand',
  'Petit',
  'Moreau',
  'Laurent',
  'Simon',
  'Michel',
  'Lefèvre',
  'Garcia',
  'Roux',
  'Fournier',
  'Girard',
  'Bonnet',
  'Dupuis',
  'Lambert',
  'Fontaine',
  'Rousseau',
  'Vincent',
  'Muller',
  'Faure',
  'André',
  'Mercier',
  'Blanc',
  'Guérin',
  'Boyer',
  'Garnier',
  'Chevalier',
  'Perrin',
  'Morel',
] as const;

export interface DemoAccount {
  email: string;
  name: string;
  role: 'administrateur' | 'scolarite' | 'intervenant' | 'apprenant';
  organisationIndex: number;
}

export interface DemoDataset {
  groupe: InferInsertModel<typeof groupe>;
  organisations: InferInsertModel<typeof organisation>[];
  etablissements: InferInsertModel<typeof etablissement>[];
  annees: InferInsertModel<typeof anneeScolaire>[];
  periodes: InferInsertModel<typeof periode>[];
  fermetures: InferInsertModel<typeof fermeture>[];
  personnes: InferInsertModel<typeof personne>[];
  comptes: DemoAccount[];
  /** Le groupe est un client de la plateforme (formule Pro), avec ses modules (RG-19-04). */
  client: InferInsertModel<typeof client>;
  contrat: InferInsertModel<typeof contrat>;
  etatsClient: InferInsertModel<typeof clientEtatEvenement>[];
  modules: InferInsertModel<typeof organisationModule>[];
  /** Compte de démonstration de la console de la plateforme (SaaS). */
  superAdministrateur: { email: string; name: string };
}

/** Modules de la formule Pro, repris de packages/referentials (sans dépendance du paquet db). */
export const DEMO_MODULES_FORMULE = [
  'socle',
  'referentiel',
  'alternance',
  'emplois-du-temps',
  'cahier-de-texte',
  'emargement',
  'notes',
  'portails',
  'crm',
  'contrats',
  'livret',
  'facturation',
  'qualite',
] as const;

/** Vacances de l'année de démonstration, choisies pour l'exemple. */
const VACANCES = [
  ['Vacances de la Toussaint', '2026-10-24', '2026-11-01'],
  ['Vacances de Noël', '2026-12-19', '2027-01-03'],
  ['Vacances d’hiver', '2027-02-20', '2027-02-28'],
  ['Vacances de printemps', '2027-04-17', '2027-04-25'],
] as const;

const ECOLES = [
  {
    nom: 'École de gestion de Lumerac',
    nomAffichage: 'EGL',
    couleur: '#8C1D40',
    campus: [
      {
        nom: 'Campus Centre',
        adresse: '1 place du Beffroi',
        codePostal: '99100',
        ville: 'Lumerac',
      },
      {
        nom: 'Campus des Tanneries',
        adresse: '24 quai des Tanneurs',
        codePostal: '99100',
        ville: 'Lumerac',
      },
    ],
  },
  {
    nom: 'Institut numérique de Lumerac',
    nomAffichage: 'INL',
    campus: [
      {
        nom: 'Campus des Ateliers',
        adresse: '7 rue des Forges',
        codePostal: '99200',
        ville: 'Lumerac-sur-Orne',
      },
    ],
  },
] as const;

const LIBELLES_ROLES: Record<DemoAccount['role'], string> = {
  administrateur: 'Administration',
  scolarite: 'Scolarité',
  intervenant: 'Intervenant',
  apprenant: 'Apprenant',
};

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-');

/** Construit le jeu complet, identique à chaque appel pour une même graine. */
export function buildDemoDataset(options: { personnesParEcole?: number; seed?: number } = {}) {
  const random = new SeededRandom(options.seed ?? DEMO_SEED);
  const personnesParEcole = options.personnesParEcole ?? 120;
  const id = () => random.uuid(CREATED_AT);

  const groupeId = id();
  const clientId = id();
  const dataset: DemoDataset = {
    groupe: { id: groupeId, nom: 'Groupe Lumerac Formation', createdAt: CREATED_AT },
    client: {
      id: clientId,
      groupeId,
      raisonSociale: 'Groupe Lumerac Formation SAS',
      sousDomaine: 'lumerac',
      administrateurNom: 'Administration EGL',
      administrateurEmail: `administrateur@egl.${DEMO_EMAIL_DOMAIN}`,
      contactFacturationNom: 'Service comptable Lumerac',
      contactFacturationEmail: `comptabilite@${DEMO_EMAIL_DOMAIN}`,
      createdAt: CREATED_AT,
    },
    contrat: {
      id: id(),
      clientId,
      formule: 'pro',
      volumeApprenants: 2000,
      dateDebut: '2026-09-01',
      dateFin: '2029-08-31',
      referenceDevis: 'DEVIS-DEMO-0001',
      createdAt: CREATED_AT,
    },
    etatsClient: [
      { id: id(), clientId, etat: 'actif', motif: 'Jeu de démonstration', survenuLe: CREATED_AT },
    ],
    modules: [],
    superAdministrateur: {
      email: `super-administrateur@plateforme.${DEMO_EMAIL_DOMAIN}`,
      name: 'Équipe Scolaly',
    },
    organisations: [],
    etablissements: [],
    annees: [],
    periodes: [],
    fermetures: [],
    personnes: [],
    comptes: [],
  };

  ECOLES.forEach((ecole, index) => {
    const organisationId = id();
    dataset.organisations.push({
      id: organisationId,
      groupeId: dataset.groupe.id ?? null,
      nom: ecole.nom,
      nomAffichage: ecole.nomAffichage,
      couleurPrincipale: 'couleur' in ecole ? ecole.couleur : null,
      createdAt: CREATED_AT,
    });
    for (const module of DEMO_MODULES_FORMULE) {
      dataset.modules.push({
        id: id(),
        organisationId,
        module,
        actif: true,
        origine: 'formule',
        createdAt: CREATED_AT,
      });
    }
    for (const campus of ecole.campus) {
      dataset.etablissements.push({
        id: id(),
        organisationId,
        nom: campus.nom,
        adresseLigne1: campus.adresse,
        codePostal: campus.codePostal,
        ville: campus.ville,
        createdAt: CREATED_AT,
      });
    }
    const anneeId = id();
    dataset.annees.push({
      id: anneeId,
      organisationId,
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
      statut: 'en_cours',
      createdAt: CREATED_AT,
    });
    dataset.periodes.push(
      {
        id: id(),
        organisationId,
        anneeScolaireId: anneeId,
        libelle: 'S1',
        dateDebut: '2026-09-01',
        dateFin: '2027-01-31',
        ordre: 1,
        createdAt: CREATED_AT,
      },
      {
        id: id(),
        organisationId,
        anneeScolaireId: anneeId,
        libelle: 'S2',
        dateDebut: '2027-02-01',
        dateFin: '2027-07-10',
        ordre: 2,
        createdAt: CREATED_AT,
      },
    );

    for (const [libelle, dateDebut, dateFin] of VACANCES) {
      dataset.fermetures.push({
        id: id(),
        organisationId,
        anneeScolaireId: anneeId,
        libelle,
        dateDebut,
        dateFin,
        type: 'vacances',
        createdAt: CREATED_AT,
      });
    }

    const domaine = `${ecole.nomAffichage.toLowerCase()}.${DEMO_EMAIL_DOMAIN}`;
    const emails = new Set<string>();
    for (let n = 0; n < personnesParEcole; n++) {
      const prenom = random.pick(PRENOMS);
      const nom = random.pick(NOMS);
      let email = `${slug(prenom)}.${slug(nom)}@${domaine}`.replace(/-+/g, '-');
      for (let suffixe = 2; emails.has(email); suffixe++) {
        email = `${slug(prenom)}.${slug(nom)}${suffixe}@${domaine}`.replace(/-+/g, '-');
      }
      emails.add(email);
      dataset.personnes.push({
        id: id(),
        organisationId,
        nom,
        prenom,
        email,
        createdAt: CREATED_AT,
      });
    }

    for (const role of ['administrateur', 'scolarite', 'intervenant', 'apprenant'] as const) {
      dataset.comptes.push({
        email: `${role}@${domaine}`,
        name: `${LIBELLES_ROLES[role]} ${ecole.nomAffichage}`,
        role,
        organisationIndex: index,
      });
    }
  });

  return dataset;
}
