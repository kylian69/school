import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/ids.js';
import { purgerIndisponibilites } from '../src/indisponibilites.js';
import { indisponibiliteIntervenant, personne } from '../src/schema/index.js';
import { createOrganisations, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
let ecoles: [string, string];
const JOUR_MS = 86_400_000;
const ilYA = (jours: number) => new Date(Date.now() - jours * JOUR_MS);
const dansJours = (jours: number) => new Date(Date.now() + jours * JOUR_MS);
// Limites telles que les calcule le worker : motif dès la fin, ligne un an après.
const limites = () => ({ motifLimite: new Date(), ligneLimite: ilYA(365) });

async function intervenant(organisationId: string): Promise<string> {
  const id = newId();
  await owner.db.insert(personne).values({
    id,
    organisationId,
    nom: 'Lambert',
    prenom: 'Sacha',
    email: `sacha.${id}@exemple.test`,
  });
  return id;
}

async function indisponibilite(
  organisationId: string,
  personneId: string,
  fin: Date,
  extra: Partial<typeof indisponibiliteIntervenant.$inferInsert> = {},
): Promise<string> {
  const id = newId();
  await owner.db.insert(indisponibiliteIntervenant).values({
    id,
    organisationId,
    personneId,
    debut: new Date(fin.getTime() - 3_600_000),
    fin,
    motifChiffre: 'v1:chiffre-de-test',
    ...extra,
  });
  return id;
}

beforeAll(async () => {
  ecoles = (await createOrganisations(2)) as [string, string];
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-04-18 conservation des indisponibilités', () => {
  it('RG-04-18 efface le motif à la fin, supprime la ligne un an après, dans chaque école', async () => {
    const [a, b] = ecoles;
    const [sachaA, sachaB] = [await intervenant(a), await intervenant(b)];
    const ancienne = await indisponibilite(a, sachaA, ilYA(400));
    const ancienneCorbeille = await indisponibilite(a, sachaA, ilYA(370), {
      motifChiffre: null,
      deletedAt: ilYA(380),
    });
    const terminee = await indisponibilite(a, sachaA, ilYA(1));
    const enCours = await indisponibilite(a, sachaA, dansJours(1));
    const autreEcole = await indisponibilite(b, sachaB, ilYA(2));
    const ids = [ancienne, ancienneCorbeille, terminee, enCours, autreEcole];

    const bilan = await purgerIndisponibilites(app.db, limites());
    expect(bilan.lignesSupprimees).toBeGreaterThanOrEqual(2);
    expect(bilan.motifsEffaces).toBeGreaterThanOrEqual(2);
    const restantes = await owner.db
      .select({ id: indisponibiliteIntervenant.id, motif: indisponibiliteIntervenant.motifChiffre })
      .from(indisponibiliteIntervenant)
      .where(inArray(indisponibiliteIntervenant.id, ids));
    expect(new Map(restantes.map((r) => [r.id, r.motif]))).toEqual(
      new Map([
        [terminee, null],
        [enCours, 'v1:chiffre-de-test'],
        [autreEcole, null],
      ]),
    );
  });

  it('RG-04-18 la purge est idempotente', async () => {
    const [a] = ecoles;
    const id = await indisponibilite(a, await intervenant(a), ilYA(3));
    await purgerIndisponibilites(app.db, limites());
    expect(await purgerIndisponibilites(app.db, limites())).toEqual({
      motifsEffaces: 0,
      lignesSupprimees: 0,
    });
    const [ligne] = await owner.db
      .select()
      .from(indisponibiliteIntervenant)
      .where(eq(indisponibiliteIntervenant.id, id));
    expect(ligne?.motifChiffre).toBeNull();
  });
});
