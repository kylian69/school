import { and, eq, isNotNull } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { newId } from '../src/ids.js';
import { withOrganisation } from '../src/organisation-context.js';
import { initialiserRolesParDefaut } from '../src/roles-par-defaut.js';
import { attribution, personne, role, rolePermission } from '../src/schema/index.js';
import { createOrganisations, expectPgError, openApp } from './fixtures.js';

const ROLES = [
  {
    code: 'administrateur',
    libelle: 'Administrateur',
    description: 'Paramétrage',
    perimetre: 'organisation',
    doubleAuthentificationRequise: true,
    permissions: ['roles:attribuer', 'audit:lire'],
  },
  {
    code: 'apprenant',
    libelle: 'Apprenant',
    description: 'Ses données',
    perimetre: 'soi',
    doubleAuthentificationRequise: false,
    permissions: [],
  },
];

const plateforme = createDatabase(inject('platformUrl'), { max: 1 });
const app = openApp();

afterAll(async () => {
  await Promise.all([plateforme.close(), app.close()]);
});

describe('RG-01-15 rôles par défaut', () => {
  it('sont créés par la console pour une école, une seule fois', async () => {
    const [org] = (await createOrganisations(1)) as [string];
    expect(await initialiserRolesParDefaut(plateforme.db, org, ROLES)).toBe(2);
    expect(await initialiserRolesParDefaut(plateforme.db, org, ROLES)).toBe(0);
    const roles = await withOrganisation(app.db, org, (tx) => tx.select().from(role));
    expect(roles.map((r) => r.code).sort()).toEqual(['administrateur', 'apprenant']);
    const permissions = await withOrganisation(app.db, org, (tx) =>
      tx.select().from(rolePermission),
    );
    expect(permissions.map((p) => p.permission).sort()).toEqual(['audit:lire', 'roles:attribuer']);
  });

  it('ne peuvent pas être supprimés ; un rôle personnalisé, si', async () => {
    const [org] = (await createOrganisations(1)) as [string];
    await initialiserRolesParDefaut(plateforme.db, org, ROLES);
    await expectPgError(
      withOrganisation(app.db, org, (tx) => tx.delete(role).where(isNotNull(role.code))),
      /ne peut pas être supprimé/,
    );
    await expectPgError(
      withOrganisation(app.db, org, (tx) =>
        tx.update(role).set({ deletedAt: new Date() }).where(eq(role.code, 'apprenant')),
      ),
      /ne peut pas être supprimé/,
    );
    const renomme = await withOrganisation(app.db, org, (tx) =>
      tx.update(role).set({ libelle: 'Étudiant' }).where(eq(role.code, 'apprenant')).returning(),
    );
    expect(renomme[0]?.libelle).toBe('Étudiant');
    const supprime = await withOrganisation(app.db, org, async (tx) => {
      const [perso] = await tx
        .insert(role)
        .values({ organisationId: org, libelle: 'Jury' })
        .returning();
      return tx
        .delete(role)
        .where(eq(role.id, perso?.id ?? ''))
        .returning();
    });
    expect(supprime).toHaveLength(1);
  });
});

describe('RG-01-14 attributions', () => {
  const preparer = async () => {
    const [org] = (await createOrganisations(1)) as [string];
    await initialiserRolesParDefaut(plateforme.db, org, ROLES);
    return withOrganisation(app.db, org, async (tx) => {
      const [p] = await tx
        .insert(personne)
        .values({
          organisationId: org,
          nom: 'Fictive',
          prenom: 'Claire',
          email: `claire.${newId()}@exemple.test`,
        })
        .returning();
      const [admin] = await tx
        .select()
        .from(role)
        .where(and(eq(role.code, 'administrateur')));
      return { org, personneId: p?.id ?? '', roleId: admin?.id ?? '' };
    });
  };

  it('exigent un périmètre cohérent : identifiant pour un établissement, aucun pour l’organisation', async () => {
    const { org, personneId, roleId } = await preparer();
    const inserer = (perimetreType: 'organisation' | 'etablissement', perimetreId: string | null) =>
      withOrganisation(app.db, org, (tx) =>
        tx.insert(attribution).values({
          organisationId: org,
          personneId,
          roleId,
          perimetreType,
          perimetreId,
          debut: '2026-09-01',
        }),
      );
    await expectPgError(inserer('etablissement', null), /attribution_perimetre/);
    await expectPgError(inserer('organisation', newId()), /attribution_perimetre/);
    await expect(inserer('organisation', null)).resolves.toBeDefined();
  });

  it('refusent une fin antérieure au début', async () => {
    const { org, personneId, roleId } = await preparer();
    await expectPgError(
      withOrganisation(app.db, org, (tx) =>
        tx.insert(attribution).values({
          organisationId: org,
          personneId,
          roleId,
          perimetreType: 'organisation',
          debut: '2026-09-01',
          fin: '2026-08-01',
        }),
      ),
      /attribution_dates/,
    );
  });
});
