import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { effacerJustificatifsEchus } from '../src/assiduite.js';
import { newId } from '../src/ids.js';
import { justificatif, personne } from '../src/schema/index.js';
import { createOrganisations, openApp, openOwner } from './fixtures.js';

const app = openApp();
const owner = openOwner();
let ecoles: [string, string];
const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000);

async function apprenant(organisationId: string): Promise<string> {
  const id = newId();
  await owner.db.insert(personne).values({
    id,
    organisationId,
    nom: 'Morel',
    prenom: 'Lina',
    email: `lina.${id}@exemple.test`,
  });
  return id;
}

async function depot(
  organisationId: string,
  personneId: string,
  deposeLe: Date,
  documentCle: string | null,
): Promise<string> {
  const id = newId();
  await owner.db.insert(justificatif).values({
    id,
    organisationId,
    personneId,
    motif: 'maladie',
    precisionChiffre: 'v1.precision',
    messageChiffre: 'v1.message',
    documentCle,
    documentType: documentCle ? 'application/pdf' : null,
    documentTaille: documentCle ? 1000 : null,
    documentSha256: documentCle ? 'a'.repeat(64) : null,
    deposeLe,
    deposePar: personneId,
    horsDelai: false,
    statut: 'accepte',
    decideLe: deposeLe,
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

describe('RG-06-20 conservation des justificatifs', () => {
  it('RG-06-20 efface document, précision et message après la durée, dans chaque école', async () => {
    const [a, b] = ecoles;
    const [linaA, linaB] = [await apprenant(a), await apprenant(b)];
    const ancien = await depot(a, linaA, ilYA(400), `organisations/${a}/justificatifs/1`);
    const ancienSansDocument = await depot(b, linaB, ilYA(380), null);
    const recent = await depot(a, linaA, ilYA(10), `organisations/${a}/justificatifs/2`);
    const supprimes: string[] = [];

    const bilan = await effacerJustificatifsEchus(app.db, ilYA(365), (cle) => {
      supprimes.push(cle);
      return Promise.resolve();
    });

    expect(supprimes).toEqual([`organisations/${a}/justificatifs/1`]);
    expect(bilan).toEqual({ justificatifs: 2, documents: 1 });
    const lignes = await owner.db
      .select()
      .from(justificatif)
      .where(inArray(justificatif.id, [ancien, ancienSansDocument, recent]));
    const parId = new Map(lignes.map((l) => [l.id, l]));
    for (const id of [ancien, ancienSansDocument]) {
      expect(parId.get(id)).toMatchObject({
        documentCle: null,
        documentType: null,
        precisionChiffre: null,
        messageChiffre: null,
        motif: 'maladie',
        statut: 'accepte',
      });
    }
    expect(parId.get(recent)?.documentCle).not.toBeNull();
    // Rejouer ne refait rien.
    expect(await effacerJustificatifsEchus(app.db, ilYA(365), () => Promise.resolve())).toEqual({
      justificatifs: 0,
      documents: 0,
    });
  });

  it('RG-06-20 garde la ligne intacte si le stockage refuse la suppression', async () => {
    const [a] = ecoles;
    const id = await depot(a, await apprenant(a), ilYA(400), `organisations/${a}/justificatifs/3`);
    await expect(
      effacerJustificatifsEchus(app.db, ilYA(365), () => Promise.reject(new Error('S3'))),
    ).rejects.toThrow('S3');
    const [ligne] = await owner.db
      .select()
      .from(justificatif)
      .where(inArray(justificatif.id, [id]));
    expect(ligne?.documentCle).toBe(`organisations/${a}/justificatifs/3`);
    await effacerJustificatifsEchus(app.db, ilYA(365), () => Promise.resolve());
  });
});
