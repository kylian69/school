import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { newId } from '../src/ids.js';
import { runMigrations } from '../src/migrate.js';
import { withOrganisation } from '../src/organisation-context.js';
import { anneeScolaire, groupe, organisation, periode } from '../src/schema/index.js';
import { createAnnee, createOrganisations, expectPgError, openApp, openOwner } from './fixtures.js';

describe('RG-00-01 cloisonnement des organisations par RLS', () => {
  const app = openApp();
  let orgA: string;
  let orgB: string;
  let anneeA: string;
  let anneeB: string;

  beforeAll(async () => {
    [orgA, orgB] = (await createOrganisations(2)) as [string, string];
    anneeA = await createAnnee(orgA);
    anneeB = await createAnnee(orgB);
  });

  afterAll(async () => {
    await app.close();
  });

  it("le rôle applicatif n'est ni superutilisateur ni exempté de RLS", async () => {
    const result = await app.db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("sans organisation fixée, aucune ligne n'est visible", async () => {
    expect(await app.db.select().from(anneeScolaire)).toEqual([]);
    expect(await app.db.select().from(organisation)).toEqual([]);
  });

  it("dans le contexte d'une organisation, seules ses lignes sont visibles", async () => {
    const annees = await withOrganisation(app.db, orgA, (tx) => tx.select().from(anneeScolaire));
    expect(annees.map((a) => a.id)).toEqual([anneeA]);
    const organisations = await withOrganisation(app.db, orgA, (tx) =>
      tx.select().from(organisation),
    );
    expect(organisations.map((o) => o.id)).toEqual([orgA]);
  });

  it("l'organisation fixée ne survit pas à la transaction", async () => {
    await withOrganisation(app.db, orgA, () => Promise.resolve());
    const result = await app.db.execute<{ org: string | null }>(
      sql`select app_current_organisation_id() as org`,
    );
    expect(result.rows[0]?.org).toBeNull();
  });

  it("refuse d'écrire une ligne pour une autre organisation", async () => {
    await expectPgError(
      withOrganisation(app.db, orgA, (tx) =>
        tx.insert(anneeScolaire).values({
          organisationId: orgB,
          libelle: 'Intrusion',
          dateDebut: '2026-09-01',
          dateFin: '2027-06-30',
        }),
      ),
      /row-level security/,
    );
  });

  it("ne modifie ni ne supprime les lignes d'une autre organisation", async () => {
    const modifiees = await withOrganisation(app.db, orgA, (tx) =>
      tx
        .update(anneeScolaire)
        .set({ libelle: 'Modifiée' })
        .where(eq(anneeScolaire.id, anneeB))
        .returning(),
    );
    const supprimees = await withOrganisation(app.db, orgA, (tx) =>
      tx.delete(anneeScolaire).where(eq(anneeScolaire.id, anneeB)).returning(),
    );
    expect(modifiees).toEqual([]);
    expect(supprimees).toEqual([]);
  });

  it("une période ne peut pas rattacher l'année d'une autre organisation", async () => {
    const owner = openOwner();
    try {
      await expectPgError(
        owner.db.insert(periode).values({
          organisationId: orgA,
          anneeScolaireId: anneeB,
          libelle: 'S1',
          dateDebut: '2026-09-01',
          dateFin: '2027-01-31',
          ordre: 1,
        }),
        /periode_annee_scolaire_fk/,
      );
    } finally {
      await owner.close();
    }
  });

  it('refuse un identifiant d’organisation mal formé', async () => {
    await expect(
      withOrganisation(app.db, "x' or 1=1 --", () => Promise.resolve(1)),
    ).rejects.toThrow(/invalide/);
  });

  it('ADR 0002 : le rôle applicatif ne crée ni groupe ni organisation', async () => {
    await expectPgError(app.db.insert(groupe).values({ nom: 'Groupe' }), /permission denied/);
    await expectPgError(
      withOrganisation(app.db, newId(), (tx) =>
        tx.insert(organisation).values({ nom: 'Nouvelle', nomAffichage: 'N' }),
      ),
      /permission denied/,
    );
  });
});

describe('Migrations', () => {
  it('peuvent être lancées deux fois en même temps sans erreur (verrou consultatif)', async () => {
    const url = inject('migratorUrl');
    await expect(Promise.all([runMigrations(url), runMigrations(url)])).resolves.toBeDefined();
  });
});
