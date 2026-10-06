import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seanceEtAttendus } from '../src/emargement.js';
import { newId } from '../src/ids.js';
import { withOrganisation } from '../src/organisation-context.js';
import {
  groupeEleves,
  groupeMembre,
  inscription,
  personne,
  seance,
  seanceAttendu,
  seancePublic,
} from '../src/schema/index.js';
import { inscrireManquants, promotionTechnique } from '../src/scolarite.js';
import { createOrganisations, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
let ecole: string;
let autre: string;
let promotionId: string;
const fiches: string[] = [];

/** Séance le jour donné (10 h à Paris), avec son public. */
async function seanceLe(jour: string, publicSeance: { promotionId?: string; groupeId?: string }) {
  const id = newId();
  await owner.db.insert(seance).values({
    id,
    organisationId: ecole,
    libelle: `Séance du ${jour}`,
    debut: new Date(`${jour}T08:00:00Z`),
    fin: new Date(`${jour}T10:00:00Z`),
  });
  await owner.db
    .insert(seancePublic)
    .values({ organisationId: ecole, seanceId: id, ...publicSeance });
  return id;
}

const attendus = (seanceId: string, organisationId = ecole) =>
  withOrganisation(app.db, organisationId, async (tx) =>
    ((await seanceEtAttendus(tx, seanceId))?.attendus ?? []).map((a) => a.nom).sort(),
  );

beforeAll(async () => {
  [ecole = '', autre = ''] = await createOrganisations(2);
  const lignes = await owner.db
    .insert(personne)
    .values(
      ['Ada', 'Blaise', 'Claude', 'Denis'].map((nom) => ({
        organisationId: ecole,
        nom,
        prenom: 'X',
        email: `${nom}.${newId()}@exemple.test`,
      })),
    )
    .returning();
  fiches.push(...lignes.map((l) => l.id));
  promotionId = await promotionTechnique(owner.db, ecole, 'Promotion des attendus');
  await inscrireManquants(owner.db, ecole, promotionId, fiches);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-06-04 apprenants attendus calculés à partir des inscriptions (I3.2)', () => {
  it('une séance de toute la promotion attend ses inscrits ; une autre école ne voit rien', async () => {
    const id = await seanceLe('2026-10-12', { promotionId });
    expect(await attendus(id)).toEqual(['Ada', 'Blaise', 'Claude', 'Denis']);
    expect(await attendus(id, autre)).toEqual([]);
  });

  it('RG-02-17 un apprenant sorti n’est plus attendu à partir de sa date de sortie', async () => {
    const [denis] = await owner.db
      .select()
      .from(inscription)
      .where(eq(inscription.personneId, fiches[3] ?? ''));
    await owner.db
      .update(inscription)
      .set({ etat: 'demissionnaire', dateSortie: '2026-11-02', motifSortie: 'Réorientation' })
      .where(eq(inscription.id, denis?.id ?? ''));
    // L'historique reste : la veille de la sortie, il était attendu.
    expect(await attendus(await seanceLe('2026-11-01', { promotionId }))).toEqual([
      'Ada',
      'Blaise',
      'Claude',
      'Denis',
    ]);
    expect(await attendus(await seanceLe('2026-11-02', { promotionId }))).toEqual([
      'Ada',
      'Blaise',
      'Claude',
    ]);
  });

  it('section 7 : une séance d’un groupe attend ses membres du jour, selon les changements de groupe', async () => {
    const [td] = await owner.db
      .insert(groupeEleves)
      .values({ organisationId: ecole, libelle: 'TD A', type: 'td' })
      .returning();
    const inscriptions = await owner.db
      .select()
      .from(inscription)
      .where(eq(inscription.promotionId, promotionId));
    const de = (i: number) => inscriptions.find((x) => x.personneId === fiches[i])?.id ?? '';
    await owner.db.insert(groupeMembre).values([
      { organisationId: ecole, groupeId: td?.id ?? '', inscriptionId: de(0), debut: '2026-09-01' },
      {
        organisationId: ecole,
        groupeId: td?.id ?? '',
        inscriptionId: de(1),
        debut: '2026-09-01',
        fin: '2026-12-01',
      },
      { organisationId: ecole, groupeId: td?.id ?? '', inscriptionId: de(2), debut: '2026-12-01' },
    ]);
    expect(await attendus(await seanceLe('2026-11-30', { groupeId: td?.id ?? '' }))).toEqual([
      'Ada',
      'Blaise',
    ]);
    expect(await attendus(await seanceLe('2026-12-01', { groupeId: td?.id ?? '' }))).toEqual([
      'Ada',
      'Claude',
    ]);
  });

  it('bascule : les attendus historiques saisis un à un restent lus', async () => {
    const id = newId();
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: 'Historique',
      debut: new Date('2026-10-05T08:00:00Z'),
      fin: new Date('2026-10-05T10:00:00Z'),
    });
    await owner.db
      .insert(seanceAttendu)
      .values({ organisationId: ecole, seanceId: id, personneId: fiches[0] ?? '' });
    expect(await attendus(id)).toEqual(['Ada']);
  });
});
