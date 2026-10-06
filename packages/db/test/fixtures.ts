import { inject } from 'vitest';
import { createDatabase } from '../src/client.js';
import { newId } from '../src/ids.js';
import { anneeScolaire, organisation } from '../src/schema/index.js';

/** Connexion du propriétaire des tables, non soumise à RLS : sert à préparer les données. */
export const openOwner = () => createDatabase(inject('migratorUrl'), { max: 2 });
export const openApp = () => createDatabase(inject('appUrl'), { max: 4 });

export async function createOrganisations(count = 2): Promise<string[]> {
  const owner = openOwner();
  try {
    const ids = Array.from({ length: count }, () => newId());
    await owner.db
      .insert(organisation)
      .values(
        ids.map((id, i) => ({ id, nom: `École fictive ${i + 1}`, nomAffichage: `EF${i + 1}` })),
      );
    return ids;
  } finally {
    await owner.close();
  }
}

export async function createAnnee(organisationId: string): Promise<string> {
  const owner = openOwner();
  try {
    const id = newId();
    await owner.db.insert(anneeScolaire).values({
      id,
      organisationId,
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
    });
    return id;
  } finally {
    await owner.close();
  }
}

/** Vérifie qu'une requête échoue avec l'erreur PostgreSQL attendue (Drizzle la place dans `cause`). */
export async function expectPgError(query: PromiseLike<unknown>, pattern: RegExp): Promise<void> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message?: string; constraint?: string } }).cause;
    const message = `${cause?.message ?? (error as Error).message} ${cause?.constraint ?? ''}`;
    if (!pattern.test(message)) {
      throw new Error(`Erreur inattendue : ${message}`, { cause: error });
    }
    return;
  }
  throw new Error('La requête aurait dû échouer.');
}
