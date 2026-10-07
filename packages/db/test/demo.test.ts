import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, DEMO_EMAIL_DOMAIN, seedDemoDataset } from '../src/demo/index.js';
import { withOrganisation } from '../src/organisation-context.js';
import {
  etablissement,
  formation,
  inscription,
  maquetteModule,
  personne,
} from '../src/schema/index.js';
import { openApp, openOwner } from './fixtures.js';

describe('Jeu de démonstration (plan, section 5)', () => {
  const owner = openOwner();
  const app = openApp();

  afterAll(async () => {
    await owner.close();
    await app.close();
  });

  it('est déterministe : même graine, mêmes données, identifiants compris', () => {
    expect(JSON.stringify(buildDemoDataset())).toBe(JSON.stringify(buildDemoDataset()));
    expect(buildDemoDataset({ seed: 1 }).groupe.id).not.toBe(buildDemoDataset().groupe.id);
  });

  it('est entièrement fictif : domaine réservé, ville inventée, aucun identifiant officiel', () => {
    const dataset = buildDemoDataset();
    const emails = [
      ...dataset.personnes.map((p) => p.email),
      ...dataset.comptes.map((c) => c.email),
    ];
    expect(emails.every((email) => email.endsWith(`.${DEMO_EMAIL_DOMAIN}`))).toBe(true);
    expect(dataset.etablissements.every((e) => e.ville?.startsWith('Lumerac'))).toBe(true);
    expect(dataset.etablissements.every((e) => !e.uai && !e.siret && !e.nda)).toBe(true);
    expect(dataset.organisations.every((o) => !o.siren)).toBe(true);
  });

  it('respecte RG-01-06 : email unique dans chaque organisation', () => {
    const dataset = buildDemoDataset();
    for (const org of dataset.organisations) {
      const emails = dataset.personnes
        .filter((p) => p.organisationId === org.id)
        .map((p) => p.email);
      expect(new Set(emails).size).toBe(emails.length);
    }
  });

  it('écrit un groupe de deux écoles, une seule fois (idempotent)', async () => {
    const dataset = buildDemoDataset();
    expect(await seedDemoDataset(owner.db, dataset)).toBe(true);
    expect(await seedDemoDataset(owner.db, dataset)).toBe(false);

    const [premiere, seconde] = dataset.organisations;
    if (!premiere?.id || !seconde?.id) throw new Error('Organisations attendues');
    const compter = (organisationId: string) =>
      withOrganisation(app.db, organisationId, async (tx) => ({
        personnes: (await tx.select({ n: sql<number>`count(*)::int` }).from(personne))[0]?.n,
        etablissements: (await tx.select().from(etablissement)).length,
        formations: (await tx.select().from(formation)).length,
        modules: (await tx.select().from(maquetteModule)).length,
        inscriptions: (await tx.select().from(inscription)).length,
      }));
    expect(await compter(premiere.id)).toEqual({
      personnes: 120,
      etablissements: 2,
      formations: 2,
      modules: 13,
      inscriptions: 120,
    });
    expect(await compter(seconde.id)).toEqual({
      personnes: 120,
      etablissements: 1,
      formations: 1,
      modules: 4,
      inscriptions: 120,
    });
    const lignes = await owner.db
      .select()
      .from(personne)
      .where(eq(personne.organisationId, premiere.id));
    expect(lignes.length).toBe(120);
  });
});
