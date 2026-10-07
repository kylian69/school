import type { InferInsertModel } from 'drizzle-orm';
import type { entreprise } from '../schema/index.js';
import { SeededRandom } from './random.js';

/**
 * Entreprises de démonstration (I3.3) : noms et adresses inventés, à Lumerac ; SIRET fictifs dont
 * seule la clé de contrôle est juste. Graine propre, pour ne pas changer le reste du jeu.
 */
const GRAINE = 20_261_104;
const CREATED_AT = new Date('2026-09-01T08:00:00Z');

const ENTREPRISES = [
  ['Ateliers du Beffroi', '1486', 'atlas', '62.01Z'],
  ['Maison Lumeracienne de la Boulange', '1979', 'akto', '10.71C'],
  ['Transports de l’Orne fictifs', '0016', 'opco-mobilites', '49.41A'],
] as const;

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

export function buildDemoEntreprises(
  organisationId: string | undefined,
): InferInsertModel<typeof entreprise>[] {
  if (!organisationId) return [];
  const random = new SeededRandom(GRAINE);
  return ENTREPRISES.map(([raisonSociale, idcc, opco, naf], rang) => {
    const siren = `9990000${String(rang + 1).padStart(2, '0')}`;
    return {
      id: random.uuid(CREATED_AT),
      organisationId,
      siret: avecCle(`${siren}0001`),
      siren,
      raisonSociale,
      adresse: `${String(rang + 3)} rue des Artisans`,
      codePostal: '99100',
      ville: 'Lumerac',
      naf,
      idcc,
      opco,
      createdAt: CREATED_AT,
    };
  });
}
