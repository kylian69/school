import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgerCorbeille } from '../src/corbeille.js';
import { newId } from '../src/ids.js';
import {
  anneeScolaire,
  attribution,
  fermeture,
  invitation,
  periode,
  personne,
  role,
} from '../src/schema/index.js';
import { createAnnee, createOrganisations, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
let ecole: string;
const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000);
const LIMITE = () => ilYA(30);

beforeAll(async () => {
  [ecole] = (await createOrganisations(1)) as [string];
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-01-23 effacement définitif de la corbeille', () => {
  it('anonymise les fiches supprimées depuis plus de 30 jours, garde les plus récentes', async () => {
    const [ancienne, recente] = [newId(), newId()];
    await owner.db.insert(personne).values([
      {
        id: ancienne,
        organisationId: ecole,
        nom: 'Benali',
        prenom: 'Inès',
        email: 'ines.purge@exemple.test',
        matricule: 'P-1',
        dateNaissance: '2006-03-14',
        deletedAt: ilYA(31),
      },
      {
        id: recente,
        organisationId: ecole,
        nom: 'Morel',
        prenom: 'Léo',
        email: 'leo.purge@exemple.test',
        deletedAt: ilYA(5),
      },
    ]);
    await owner.db.insert(invitation).values({
      organisationId: ecole,
      personneId: ancienne,
      jetonEmpreinte: newId(),
      email: 'ines.purge@exemple.test',
      expireLe: ilYA(20),
    });

    const bilan = await purgerCorbeille(app.db, LIMITE());
    expect(bilan.personnes).toBe(1);
    const [anonyme] = await owner.db.select().from(personne).where(eq(personne.id, ancienne));
    expect(anonyme).toMatchObject({
      nom: 'Fiche effacée',
      email: `efface+${ancienne}@invalid`,
      dateNaissance: null,
      matricule: 'P-1',
    });
    expect(
      await owner.db.select().from(invitation).where(eq(invitation.personneId, ancienne)),
    ).toEqual([]);
    const [gardee] = await owner.db.select().from(personne).where(eq(personne.id, recente));
    expect(gardee?.nom).toBe('Morel');

    // Une fiche déjà anonymisée n'est pas traitée de nouveau.
    expect((await purgerCorbeille(app.db, LIMITE())).personnes).toBe(0);
  });

  it('efface les années (périodes et fermetures comprises), les fermetures et les rôles inutilisés', async () => {
    const annee = await createAnnee(ecole);
    await owner.db.insert(periode).values({
      organisationId: ecole,
      anneeScolaireId: annee,
      libelle: 'S1',
      dateDebut: '2026-09-01',
      dateFin: '2027-01-31',
      ordre: 1,
      deletedAt: ilYA(40),
    });
    await owner.db
      .update(anneeScolaire)
      .set({ deletedAt: ilYA(40) })
      .where(eq(anneeScolaire.id, annee));
    const autreAnnee = await createAnnee(ecole);
    const [fermee] = await owner.db
      .insert(fermeture)
      .values({
        organisationId: ecole,
        anneeScolaireId: autreAnnee,
        libelle: 'Pont',
        dateDebut: '2027-05-07',
        dateFin: '2027-05-07',
        deletedAt: ilYA(35),
      })
      .returning();
    const [inutile, cite] = [newId(), newId()];
    await owner.db.insert(role).values([
      { id: inutile, organisationId: ecole, libelle: 'Inutile', deletedAt: ilYA(31) },
      { id: cite, organisationId: ecole, libelle: 'Cité', deletedAt: ilYA(31) },
    ]);
    const fiche = newId();
    await owner.db
      .insert(personne)
      .values({
        id: fiche,
        organisationId: ecole,
        nom: 'Roux',
        prenom: 'Noa',
        email: 'noa.purge@exemple.test',
      });
    await owner.db.insert(attribution).values({
      organisationId: ecole,
      personneId: fiche,
      roleId: cite,
      perimetreType: 'organisation',
      debut: '2026-01-01',
      fin: '2026-02-01',
    });

    const bilan = await purgerCorbeille(app.db, LIMITE());
    expect(bilan).toMatchObject({ annees: 1, fermetures: 1, roles: 1 });
    expect(await owner.db.select().from(anneeScolaire).where(eq(anneeScolaire.id, annee))).toEqual(
      [],
    );
    expect(await owner.db.select().from(periode).where(eq(periode.anneeScolaireId, annee))).toEqual(
      [],
    );
    expect(
      await owner.db
        .select()
        .from(fermeture)
        .where(eq(fermeture.id, fermee?.id ?? '')),
    ).toEqual([]);
    const restants = await owner.db
      .select()
      .from(role)
      .where(inArray(role.id, [inutile, cite]));
    expect(restants.map((r) => r.libelle)).toEqual(['Cité']);
  });
});
