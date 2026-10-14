import {
  EVENEMENT_CORRECTION_VERROUILLEE,
  ROLES_PAR_DEFAUT,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import {
  appelValidation,
  attribution,
  createDatabase,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
  seance,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { signalerCorrectionVerrouillee } from '../src/correction-verrouillee.js';

const app = createDatabase(inject('appUrl'), { max: 2 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const ecole = newId();
const seanceId = newId();
const J = 24 * 3600_000;
const fiches = { iris: newId(), sacha: newId(), paul: newId(), ancienne: newId(), lou: newId() };

const evenement: EvenementJob = {
  id: newId(),
  organisationId: ecole,
  type: EVENEMENT_CORRECTION_VERROUILLEE,
  charge: { seanceId, version: 2 },
  survenuLe: new Date().toISOString(),
};
const envois: { email: EmailJob; cle: string }[] = [];
const envoyer = (email: EmailJob, cle: string) => {
  envois.push({ email, cle });
  return Promise.resolve();
};

async function attribuer(
  nom: keyof typeof fiches,
  code: string,
  perimetreType: 'soi' | 'organisation',
  fin: string | null = null,
) {
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiches[nom],
    roleId: leRole?.id ?? '',
    perimetreType,
    debut: '2026-01-01',
    fin,
  });
}

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des corrections', nomAffichage: 'EC' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  for (const [prenom, id] of Object.entries(fiches))
    await owner.db.insert(personne).values({
      id,
      organisationId: ecole,
      nom: 'Fictif',
      prenom,
      email: `${prenom}.${id}@exemple.test`,
    });
  await attribuer('iris', 'intervenant', 'soi');
  await attribuer('sacha', 'scolarite', 'organisation');
  await attribuer('paul', 'responsable-pedagogique', 'organisation');
  // Attribution terminée : plus destinataire.
  await attribuer('ancienne', 'scolarite', 'organisation', '2026-02-01');
  await attribuer('lou', 'apprenant', 'soi');
  const debut = new Date(Date.now() - 10 * J);
  await owner.db.insert(seance).values({
    id: seanceId,
    organisationId: ecole,
    libelle: 'Droit social',
    statut: 'publiee',
    debut,
    fin: new Date(debut.getTime() + 2 * 3600_000),
  });
  await owner.db.insert(appelValidation).values({
    organisationId: ecole,
    seanceId,
    version: 2,
    validePar: fiches.iris,
    valideLe: new Date(),
    adresseIp: '192.0.2.1',
    appareil: 'a'.repeat(64),
    empreinte: 'b'.repeat(64),
    liste: [],
    motif: 'Lou absente pour raison médicale',
    correctionVerrouillee: 'intervenant',
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-06-15 signalement d’une correction d’appel verrouillé par un intervenant', () => {
  it('RG-06-15 la scolarité et la pédagogie de l’école reçoivent un email, sans motif ni apprenant', async () => {
    expect(
      await signalerCorrectionVerrouillee(app.db, evenement, envoyer, 'https://ecole.test'),
    ).toBe(2);
    expect(envois.map((e) => e.email.to).sort()).toEqual(
      [`paul.${fiches.paul}@exemple.test`, `sacha.${fiches.sacha}@exemple.test`].sort(),
    );
    const [premier] = envois;
    expect(premier?.email.subject).toContain('Appel verrouillé corrigé par un intervenant');
    expect(premier?.email.text).toContain('iris Fictif');
    expect(premier?.email.text).toContain('Droit social');
    expect(premier?.email.text).toContain(`https://ecole.test/seances/${seanceId}/appel`);
    // Minimisation : ni le motif ni l'apprenant ne partent par email.
    expect(premier?.email.text).not.toContain('médicale');
    expect(premier?.email.html).not.toContain('médicale');
  });

  it('RG-06-15 rejouer l’événement garde les mêmes clés d’envoi (aucun doublon dans la file)', async () => {
    const cles = envois.map((e) => e.cle);
    await signalerCorrectionVerrouillee(app.db, evenement, envoyer, 'https://ecole.test');
    expect(envois.slice(cles.length).map((e) => e.cle)).toEqual(cles);
  });
});
