import type { InferInsertModel } from 'drizzle-orm';
import type {
  contactEntreprise,
  contratAlternance,
  contratTuteur,
  entreprise,
  inscription,
  inscriptionStatut,
  personne,
} from '../schema/index.js';
import { SeededRandom } from './random.js';

/**
 * Entreprises de démonstration (I3.3) : noms et adresses inventés, à Lumerac ; SIRET fictifs dont
 * seule la clé de contrôle est juste ; un tuteur par entreprise et un contrat en cours pour les
 * premiers apprentis de l'école. Graine propre, pour ne pas changer le reste du jeu.
 */
const GRAINE = 20_261_104;
const CREATED_AT = new Date('2026-09-01T08:00:00Z');

const ENTREPRISES = [
  ['Ateliers du Beffroi', '1486', 'atlas', '62.01Z', 'Morel', 'Iris'],
  ['Maison Lumeracienne de la Boulange', '1979', 'akto', '10.71C', 'Garnier', 'Basile'],
  ['Transports de l’Orne fictifs', '0016', 'opco-mobilites', '49.41A', 'Roux', 'Maëlle'],
] as const;

export interface DemoAlternance {
  entreprises: InferInsertModel<typeof entreprise>[];
  tuteurs: InferInsertModel<typeof personne>[];
  contacts: InferInsertModel<typeof contactEntreprise>[];
  contrats: InferInsertModel<typeof contratAlternance>[];
  contratTuteurs: InferInsertModel<typeof contratTuteur>[];
}

/** Clé de Luhn ajoutée à 13 chiffres. */
function avecCle(debut: string): string {
  for (let cle = 0; cle < 10; cle++) {
    const candidat = `${debut}${String(cle)}`;
    let somme = 0;
    for (let i = 0; i < 14; i++) {
      const c = Number(candidat[13 - i]);
      const v = i % 2 === 1 ? c * 2 : c;
      somme += v > 9 ? v - 9 : v;
    }
    if (somme % 10 === 0) return candidat;
  }
  return `${debut}0`;
}

/** Ajoute des années à une date AAAA-MM-JJ (veille de l'anniversaire : fin d'un contrat). */
function finApres(debut: string, annees: number): string {
  const [a = 0, m = 1, j = 1] = debut.split('-').map(Number);
  return new Date(Date.UTC(a + annees, m - 1, j - 1)).toISOString().slice(0, 10);
}

export function buildDemoAlternance(
  organisationId: string | undefined,
  scolarite: {
    inscriptions: readonly InferInsertModel<typeof inscription>[];
    statuts: readonly InferInsertModel<typeof inscriptionStatut>[];
  },
): DemoAlternance {
  const jeu: DemoAlternance = {
    entreprises: [],
    tuteurs: [],
    contacts: [],
    contrats: [],
    contratTuteurs: [],
  };
  if (!organisationId) return jeu;
  const random = new SeededRandom(GRAINE);
  const commun = { organisationId, createdAt: CREATED_AT };
  for (const [rang, [raisonSociale, idcc, opco, naf, nom, prenom]] of ENTREPRISES.entries()) {
    const siren = `9990000${String(rang + 1).padStart(2, '0')}`;
    const entrepriseId = random.uuid(CREATED_AT);
    jeu.entreprises.push({
      ...commun,
      id: entrepriseId,
      siret: avecCle(`${siren}0001`),
      siren,
      raisonSociale,
      adresse: `${String(rang + 3)} rue des Artisans`,
      codePostal: '99100',
      ville: 'Lumerac',
      naf,
      idcc,
      opco,
    });
    const tuteurId = random.uuid(CREATED_AT);
    jeu.tuteurs.push({
      ...commun,
      id: tuteurId,
      nom,
      prenom,
      email: `${prenom.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')}.${nom.toLowerCase()}@entreprise.demo.scolaly.test`,
    });
    jeu.contacts.push({
      ...commun,
      id: random.uuid(CREATED_AT),
      entrepriseId,
      personneId: tuteurId,
      type: 'tuteur',
      fonction: 'Maître d’apprentissage',
      dansEntrepriseDepuis: '2019-09-01',
    });
  }
  // Un contrat d'apprentissage en cours pour les trois premiers apprentis de l'école.
  const apprentis = scolarite.inscriptions.filter(
    (i) =>
      i.organisationId === organisationId &&
      scolarite.statuts.some((s) => s.inscriptionId === i.id && s.statut === 'apprenti'),
  );
  for (const [rang, i] of apprentis.slice(0, ENTREPRISES.length).entries()) {
    const entreprise = jeu.entreprises[rang];
    const tuteur = jeu.tuteurs[rang];
    if (!i.id || !entreprise?.id || !tuteur?.id) continue;
    const contratId = random.uuid(CREATED_AT);
    jeu.contrats.push({
      ...commun,
      id: contratId,
      inscriptionId: i.id,
      personneId: i.personneId,
      entrepriseId: entreprise.id,
      type: 'apprentissage',
      debut: i.dateEntree,
      fin: finApres(i.dateEntree, 2),
      opco: entreprise.opco,
      statut: 'en_cours',
    });
    jeu.contratTuteurs.push({
      ...commun,
      id: random.uuid(CREATED_AT),
      contratId,
      personneId: tuteur.id,
      debut: i.dateEntree,
    });
  }
  return jeu;
}
