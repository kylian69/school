import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/ids.js';
import {
  ajouterEvenement,
  creerPartitionsAudit,
  enregistrerAudit,
  publierEvenements,
  type EvenementAPublier,
} from '../src/journal.js';
import { withOrganisation } from '../src/organisation-context.js';
import { anneeScolaire } from '../src/schema/index.js';
import { auditEvenement, outboxEvenement } from '../src/schema/journal.js';
import { createOrganisations, expectPgError, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
let orgA: string;
let orgB: string;

beforeAll(async () => {
  [orgA, orgB] = (await createOrganisations(2)) as [string, string];
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("RG-01-22 journal d'audit", () => {
  it("enregistre l'action avec les valeurs avant et après, dans l'organisation courante", async () => {
    const objetId = newId();
    await withOrganisation(app.db, orgA, (tx) =>
      enregistrerAudit(tx, {
        action: 'note.modifier',
        objetType: 'note',
        objetId,
        adresseIp: '192.0.2.10',
        avant: { valeur: 12 },
        apres: { valeur: 14 },
      }),
    );
    const [ligne] = await withOrganisation(app.db, orgA, (tx) =>
      tx.select().from(auditEvenement).where(eq(auditEvenement.objetId, objetId)),
    );
    expect(ligne).toMatchObject({
      organisationId: orgA,
      action: 'note.modifier',
      adresseIp: '192.0.2.10',
      avant: { valeur: 12 },
      apres: { valeur: 14 },
    });
  });

  it("est annulé avec la transaction métier : pas de trace d'une action non faite", async () => {
    const objetId = newId();
    await expect(
      withOrganisation(app.db, orgA, async (tx) => {
        await enregistrerAudit(tx, { action: 'annee.creer', objetType: 'annee', objetId });
        await tx.insert(anneeScolaire).values({
          libelle: 'Dates invalides',
          organisationId: orgA,
          dateDebut: '2027-09-01',
          dateFin: '2026-09-01',
        });
      }),
    ).rejects.toThrow();
    const lignes = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, objetId));
    expect(lignes).toEqual([]);
  });

  it("refuse une écriture hors du contexte d'une organisation", async () => {
    await expectPgError(
      app.db.insert(auditEvenement).values({ action: 'x', objetType: 'y' }),
      /null value|row-level security/,
    );
  });

  it('personne ne le modifie ni ne le supprime, pas même le propriétaire des tables', async () => {
    await expectPgError(owner.db.update(auditEvenement).set({ action: 'falsifiee' }), /ajout seul/);
    await expectPgError(owner.db.delete(auditEvenement), /ajout seul/);
  });

  it('a ses partitions mensuelles, du mois courant à trois mois plus tard', async () => {
    await creerPartitionsAudit(app.db, 3);
    await creerPartitionsAudit(app.db, 3);
    const result = await owner.db.execute<{ partitions: number }>(sql`
      select count(*)::int as partitions from pg_inherits
      where inhparent = 'audit_evenement'::regclass`);
    expect(result.rows[0]?.partitions).toBeGreaterThanOrEqual(4);
  });
});

describe('Boîte d’envoi des événements internes', () => {
  const marque = () => `test.${newId()}`;
  const deMaMarque = (type: string) => (e: EvenementAPublier) => e.type === type;

  it('publie dans l’ordre les événements de toutes les organisations, une seule fois', async () => {
    const type = marque();
    await withOrganisation(app.db, orgA, (tx) => ajouterEvenement(tx, type, { n: 1 }));
    await withOrganisation(app.db, orgB, (tx) => ajouterEvenement(tx, type, { n: 2 }));

    const publies: EvenementAPublier[] = [];
    while (
      (await publierEvenements(app.db, 50, (lot) => Promise.resolve(void publies.push(...lot)))) > 0
    );

    const miens = publies.filter(deMaMarque(type));
    expect(miens.map((e) => e.charge)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(miens.map((e) => e.organisationId)).toEqual([orgA, orgB]);
    expect(await publierEvenements(app.db, 50, () => Promise.resolve())).toBe(0);
  });

  it("en cas d'échec, garde les événements à publier et note l'erreur", async () => {
    const type = marque();
    await withOrganisation(app.db, orgA, (tx) => ajouterEvenement(tx, type, {}));
    await expect(
      publierEvenements(app.db, 500, () => Promise.reject(new Error('Valkey injoignable'))),
    ).rejects.toThrow('Valkey injoignable');

    const [ligne] = await owner.db
      .select()
      .from(outboxEvenement)
      .where(eq(outboxEvenement.type, type));
    expect(ligne).toMatchObject({
      publieLe: null,
      tentatives: 1,
      derniereErreur: 'Valkey injoignable',
    });

    const publies: EvenementAPublier[] = [];
    await publierEvenements(app.db, 500, (lot) => Promise.resolve(void publies.push(...lot)));
    expect(publies.filter(deMaMarque(type))).toHaveLength(1);
  });

  it('plusieurs publieurs en parallèle ne publient jamais deux fois le même événement', async () => {
    const type = marque();
    await withOrganisation(app.db, orgA, async (tx) => {
      for (let n = 0; n < 40; n++) await ajouterEvenement(tx, type, { n });
    });
    const publies: EvenementAPublier[] = [];
    const publieur = async () => {
      while (
        (await publierEvenements(app.db, 5, async (lot) => {
          await new Promise((resolve) => setTimeout(resolve, 2));
          publies.push(...lot);
        })) > 0
      );
    };
    await Promise.all([publieur(), publieur(), publieur()]);
    const ids = publies.filter(deMaMarque(type)).map((e) => e.id);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
  });
});
