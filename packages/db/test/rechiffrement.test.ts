import { randomBytes } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FieldEncryption } from '../src/chiffrement.js';
import { newId } from '../src/ids.js';
import {
  CHAMPS_CHIFFRES,
  compterValeursChiffrees,
  contexteChiffrement,
  rechiffrerValeurs,
  retraitPossible,
  type ChampChiffre,
} from '../src/rechiffrement.js';
import { fluxIcal, indisponibiliteIntervenant, personne } from '../src/schema/index.js';
import { auditEvenement } from '../src/schema/journal.js';
import { createOrganisations, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
const v1 = randomBytes(32);
const v2 = randomBytes(32);
const cles = (currentVersion: number) =>
  new FieldEncryption({
    masterKeys: new Map([
      [1, v1],
      [2, v2],
    ]),
    currentVersion,
  });
const avantRotation = new FieldEncryption({ masterKeys: new Map([[1, v1]]), currentVersion: 1 });
let ecoles: [string, string];

interface Valeur {
  champ: ChampChiffre;
  organisationId: string;
  id: string;
  cle: string;
  clair: string;
}
const valeurs: Valeur[] = [];

async function intervenant(organisationId: string): Promise<string> {
  const id = newId();
  await owner.db.insert(personne).values({
    id,
    organisationId,
    nom: 'Morel',
    prenom: 'Camille',
    email: `camille.${id}@exemple.test`,
  });
  return id;
}

/** Une indisponibilité et un flux iCal par intervenant, chiffrés avec la clé v1. */
async function preparer(organisationId: string, nombre: number) {
  for (let i = 0; i < nombre; i += 1) {
    const personneId = await intervenant(organisationId);
    const id = newId();
    const motif = `Motif fictif ${i} ${organisationId}`;
    await owner.db.insert(indisponibiliteIntervenant).values({
      id,
      organisationId,
      personneId,
      debut: new Date('2027-01-04T08:00:00Z'),
      fin: new Date('2027-01-04T10:00:00Z'),
      motifChiffre: avantRotation.encrypt(
        motif,
        organisationId,
        contexteChiffrement('indisponibilite_intervenant.motif', id),
      ),
    });
    valeurs.push({
      champ: 'indisponibilite_intervenant.motif',
      organisationId,
      id,
      cle: id,
      clair: motif,
    });
    const fluxId = newId();
    const jeton = `jeton-fictif-${randomBytes(8).toString('hex')}`;
    await owner.db.insert(fluxIcal).values({
      id: fluxId,
      organisationId,
      personneId,
      jetonEmpreinte: randomBytes(16).toString('hex'),
      jetonChiffre: avantRotation.encrypt(
        jeton,
        organisationId,
        contexteChiffrement('flux_ical.jeton', personneId),
      ),
    });
    valeurs.push({
      champ: 'flux_ical.jeton',
      organisationId,
      id: fluxId,
      cle: personneId,
      clair: jeton,
    });
  }
}

async function lire(v: Valeur): Promise<string | null> {
  if (v.champ === 'flux_ical.jeton') {
    const [ligne] = await owner.db
      .select({ valeur: fluxIcal.jetonChiffre })
      .from(fluxIcal)
      .where(eq(fluxIcal.id, v.id));
    return ligne?.valeur ?? null;
  }
  const [ligne] = await owner.db
    .select({ valeur: indisponibiliteIntervenant.motifChiffre })
    .from(indisponibiliteIntervenant)
    .where(eq(indisponibiliteIntervenant.id, v.id));
  return ligne?.valeur ?? null;
}

const nosComptages = async () =>
  (await compterValeursChiffrees(app.db)).filter((c) => ecoles.includes(c.organisationId));

beforeAll(async () => {
  ecoles = (await createOrganisations(2)) as [string, string];
  await preparer(ecoles[0], 5);
  await preparer(ecoles[1], 2);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('Rotation de la clé maîtresse (ADR 0006)', () => {
  it("l'inventaire couvre toutes les colonnes chiffrées du schéma", async () => {
    const colonnes = await owner.db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' and column_name like '%\\_chiffre' order by 1, 2`,
    );
    expect(colonnes.rows.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual(
      Object.values(CHAMPS_CHIFFRES)
        .map((c) => `${c.table}.${c.colonne}`)
        .sort(),
    );
    const champs = new Set((await nosComptages()).map((c) => c.champ));
    expect([...champs].sort()).toEqual(Object.keys(CHAMPS_CHIFFRES).sort());
  });

  it('compte les valeurs par école, champ et version, sans rien en révéler', async () => {
    const comptages = await nosComptages();
    expect(comptages).toEqual(
      expect.arrayContaining([
        {
          organisationId: ecoles[0],
          champ: 'indisponibilite_intervenant.motif',
          version: 1,
          nombre: 5,
        },
        { organisationId: ecoles[0], champ: 'flux_ical.jeton', version: 1, nombre: 5 },
        { organisationId: ecoles[1], champ: 'flux_ical.jeton', version: 1, nombre: 2 },
      ]),
    );
    expect(retraitPossible(comptages, 1, 2)).toEqual({
      possible: false,
      restantes: 14,
      illisibles: 0,
    });
  });

  it('rechiffre chaque champ par lots, reprend après une interruption, puis ne refait rien', async () => {
    const crypto = cles(2);
    // Interruption simulée : deux lots seulement, puis arrêt.
    const partiel = await rechiffrerValeurs(app.db, crypto, {
      taille: 2,
      lotsMax: 2,
      organisationIds: ecoles,
    });
    expect(partiel).toMatchObject({ lots: 2, rechiffrees: 4 });
    const pendant = await nosComptages();
    expect(retraitPossible(pendant, 1, 2).restantes).toBe(10);

    const reprise = await rechiffrerValeurs(app.db, crypto, { taille: 2, organisationIds: ecoles });
    expect(reprise.rechiffrees).toBeGreaterThanOrEqual(10);
    const apres = await nosComptages();
    expect(apres.every((c) => c.version === 2)).toBe(true);
    expect(retraitPossible(apres, 1, 2)).toEqual({ possible: true, restantes: 0, illisibles: 0 });

    // Chaque valeur se relit avec la seule clé v2, dans son école et son champ.
    const sansV1 = new FieldEncryption({ masterKeys: new Map([[2, v2]]), currentVersion: 2 });
    for (const v of valeurs) {
      const chiffre = await lire(v);
      expect(chiffre).toMatch(/^v2\./);
      expect(
        sansV1.decrypt(chiffre ?? '', v.organisationId, contexteChiffrement(v.champ, v.cle)),
      ).toBe(v.clair);
    }

    const encore = await rechiffrerValeurs(app.db, crypto, { taille: 2, organisationIds: ecoles });
    const nosValeurs = await nosComptages();
    expect(nosValeurs.every((c) => c.version === 2)).toBe(true);
    expect(encore.rechiffrees).toBe(0);
  });

  it("chaque valeur reste liée à son école : rien n'a été recopié d'une école à l'autre", async () => {
    const crypto = cles(2);
    for (const v of valeurs) {
      const autre = v.organisationId === ecoles[0] ? ecoles[1] : ecoles[0];
      const chiffre = (await lire(v)) ?? '';
      expect(() => crypto.decrypt(chiffre, autre, contexteChiffrement(v.champ, v.cle))).toThrow();
    }
  });

  it('inscrit chaque lot au journal d’audit de son école, avec des comptes seulement', async () => {
    const entrees = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.action, 'chiffrement.rechiffrement'),
          inArray(auditEvenement.organisationId, ecoles),
        ),
      );
    expect(entrees.length).toBeGreaterThan(0);
    const total = entrees.reduce(
      (somme, e) => somme + ((e.apres as { nombre: number } | null)?.nombre ?? 0),
      0,
    );
    expect(total).toBe(14);
    const texte = JSON.stringify(entrees);
    for (const v of valeurs) expect(texte).not.toContain(v.clair);
    expect(entrees[0]?.avant).toEqual({ versions: ['v1'] });
  });

  it('laisse en place une valeur illisible, la compte, et interdit alors le retrait', async () => {
    const [cible] = valeurs;
    if (!cible) throw new Error('Aucune valeur');
    const personneId = await intervenant(ecoles[1]);
    const id = newId();
    const alteree = `v1.${randomBytes(12).toString('base64url')}.AAAA.${randomBytes(16).toString('base64url')}`;
    await owner.db.insert(indisponibiliteIntervenant).values({
      id,
      organisationId: ecoles[1],
      personneId,
      debut: new Date('2027-01-05T08:00:00Z'),
      fin: new Date('2027-01-05T10:00:00Z'),
      motifChiffre: alteree,
    });
    const bilan = await rechiffrerValeurs(app.db, cles(2), { taille: 2, organisationIds: ecoles });
    expect(bilan.echecs).toBeGreaterThanOrEqual(1);
    const [ligne] = await owner.db
      .select({ motif: indisponibiliteIntervenant.motifChiffre })
      .from(indisponibiliteIntervenant)
      .where(eq(indisponibiliteIntervenant.id, id));
    expect(ligne?.motif).toBe(alteree);
    expect(retraitPossible(await nosComptages(), 1, 2)).toEqual({
      possible: false,
      restantes: 1,
      illisibles: 0,
    });
    expect(retraitPossible([], 2, 2).possible).toBe(false);
    expect(
      retraitPossible([{ organisationId: id, champ: 'x', version: null, nombre: 1 }], 1, 2),
    ).toEqual({ possible: false, restantes: 0, illisibles: 1 });
  });
});
