import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/ids.js';
import { etablissement, seance, seanceSerie } from '../src/schema/index.js';
import { createOrganisations, expectPgError, openOwner } from './fixtures.js';

const owner = openOwner();
let ecole: string;
let etablissementId: string;

const creneau = {
  libelle: 'Séance fictive',
  debut: new Date('2026-09-01T07:00:00Z'),
  fin: new Date('2026-09-01T10:30:00Z'),
};

beforeAll(async () => {
  [ecole = ''] = await createOrganisations(1);
  etablissementId = newId();
  await owner.db
    .insert(etablissement)
    .values({ id: etablissementId, organisationId: ecole, nom: 'Campus' });
});

afterAll(async () => {
  await owner.close();
});

describe('RG-04-01 séance complétée', () => {
  it('publie par défaut les séances créées sans statut (séances d’avant I4.1)', async () => {
    const id = newId();
    await owner.db.insert(seance).values({ id, organisationId: ecole, ...creneau });
    const [ligne] = await owner.db.select().from(seance).where(eq(seance.id, id));
    expect(ligne).toMatchObject({ statut: 'publiee', type: null, serieId: null });
  });

  it('RG-04-04 refuse une séance annulée sans motif', async () => {
    await expectPgError(
      owner.db.insert(seance).values({ organisationId: ecole, ...creneau, statut: 'annulee' }),
      /seance_annulation_check/,
    );
    await owner.db.insert(seance).values({
      organisationId: ecole,
      ...creneau,
      statut: 'annulee',
      motifAnnulation: 'Intervenant absent',
    });
  });
});

describe('RG-04-03 série de séances', () => {
  const regle = {
    dateDebut: '2026-09-01',
    dateFin: '2026-12-15',
    joursSemaine: [2],
    heureDebut: '09:00',
    heureFin: '12:30',
  };

  it('refuse une règle incohérente', async () => {
    for (const erreur of [
      { dateFin: '2026-08-31' },
      { heureFin: '08:00' },
      { intervalleSemaines: 0 },
      { joursSemaine: [] },
    ]) {
      await expectPgError(
        owner.db
          .insert(seanceSerie)
          .values({ organisationId: ecole, etablissementId, ...regle, ...erreur }),
        /seance_serie_regle_check/,
      );
    }
  });

  it('rattache des séances indépendantes à leur série', async () => {
    const serieId = newId();
    await owner.db
      .insert(seanceSerie)
      .values({ id: serieId, organisationId: ecole, etablissementId, ...regle });
    await owner.db
      .insert(seance)
      .values({ organisationId: ecole, ...creneau, serieId, statut: 'brouillon' });
    const lignes = await owner.db.select().from(seance).where(eq(seance.serieId, serieId));
    expect(lignes).toHaveLength(1);
  });
});
