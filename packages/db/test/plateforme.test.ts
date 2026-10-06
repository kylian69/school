import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { newId } from '../src/ids.js';
import { withOrganisation } from '../src/organisation-context.js';
import {
  client,
  clientEtatEvenement,
  contrat,
  etablissement,
  groupe,
  organisation,
  organisationModule,
  personne,
  plateformeAudit,
} from '../src/schema/index.js';
import { expectPgError, openApp, openOwner } from './fixtures.js';

const plateforme = createDatabase(inject('platformUrl'), { max: 2 });
const app = openApp();
const owner = openOwner();

afterAll(async () => {
  await Promise.all([plateforme.close(), app.close(), owner.close()]);
});

async function creerClient() {
  const groupeId = newId();
  const organisationId = newId();
  const clientId = newId();
  await plateforme.db.transaction(async (tx) => {
    await tx.insert(groupe).values({ id: groupeId, nom: 'Groupe fictif' });
    await tx
      .insert(organisation)
      .values({ id: organisationId, groupeId, nom: 'École fictive', nomAffichage: 'EF' });
    await tx.insert(client).values({
      id: clientId,
      groupeId,
      raisonSociale: 'Groupe fictif SAS',
      sousDomaine: `fictif-${organisationId.slice(-8)}`,
      administrateurNom: 'Camille Fictive',
      administrateurEmail: 'camille@exemple.test',
    });
    await tx.insert(contrat).values({
      clientId,
      formule: 'essentiel',
      volumeApprenants: 800,
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
    });
    await tx.insert(clientEtatEvenement).values({ clientId, etat: 'actif', motif: 'Devis signé' });
    await tx
      .insert(organisationModule)
      .values({ organisationId, module: 'notes', actif: true, origine: 'formule' });
  });
  return { groupeId, organisationId, clientId };
}

describe('ADR 0004 : rôle de la console de la plateforme', () => {
  it('crée un client complet : groupe, école, contrat, historique et modules', async () => {
    const { clientId } = await creerClient();
    const [ligne] = await plateforme.db.select().from(client).where(eq(client.id, clientId));
    expect(ligne?.etat).toBe('actif');
  });

  it('voit toutes les organisations, sans contexte d’école', async () => {
    const { organisationId } = await creerClient();
    const lignes = await plateforme.db
      .select()
      .from(organisation)
      .where(eq(organisation.id, organisationId));
    expect(lignes).toHaveLength(1);
  });

  it("n'accède à aucune donnée métier d'une école", async () => {
    await expectPgError(plateforme.db.select().from(etablissement), /permission denied/);
    await expectPgError(plateforme.db.select().from(personne), /permission denied/);
    await expectPgError(
      plateforme.db.execute(sql`select * from audit_evenement`),
      /permission denied/,
    );
  });

  it("ne modifie ni l'historique des états ni l'audit de la plateforme", async () => {
    await plateforme.db
      .insert(plateformeAudit)
      .values({ action: 'client.creer', objetType: 'client' });
    await expectPgError(plateforme.db.delete(plateformeAudit), /permission denied/);
    await expectPgError(
      owner.db.update(clientEtatEvenement).set({ motif: 'falsifié' }),
      /ajout seul/,
    );
  });
});

describe('Ce que voit une école', () => {
  it('ne lit ni les clients ni les contrats', async () => {
    await expectPgError(app.db.select().from(client), /permission denied/);
    await expectPgError(app.db.select().from(contrat), /permission denied/);
  });

  it('lit ses propres modules, sans pouvoir les changer', async () => {
    const { organisationId } = await creerClient();
    const modules = await withOrganisation(app.db, organisationId, (tx) =>
      tx.select().from(organisationModule),
    );
    expect(modules.map((m) => m.module)).toEqual(['notes']);
    await expectPgError(
      withOrganisation(app.db, organisationId, (tx) =>
        tx.update(organisationModule).set({ actif: false }),
      ),
      /permission denied/,
    );
  });
});

describe('RG-19-02 accès de l’école tenu par la console', () => {
  it('une école ne peut ni rouvrir son accès ni changer de groupe, mais modifie son nom', async () => {
    const { organisationId } = await creerClient();
    await plateforme.db
      .update(organisation)
      .set({ acces: 'lecture_seule' })
      .where(eq(organisation.id, organisationId));
    await expectPgError(
      withOrganisation(app.db, organisationId, (tx) =>
        tx
          .update(organisation)
          .set({ acces: 'complet' })
          .where(eq(organisation.id, organisationId)),
      ),
      /permission denied/,
    );
    await expectPgError(
      withOrganisation(app.db, organisationId, (tx) =>
        tx.update(organisation).set({ groupeId: null }).where(eq(organisation.id, organisationId)),
      ),
      /permission denied/,
    );
    const [renommee] = await withOrganisation(app.db, organisationId, (tx) =>
      tx
        .update(organisation)
        .set({ nomAffichage: 'Nouveau nom' })
        .where(eq(organisation.id, organisationId))
        .returning({ acces: organisation.acces }),
    );
    expect(renommee?.acces).toBe('lecture_seule');
  });
});
