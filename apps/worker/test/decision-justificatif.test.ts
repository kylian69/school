import {
  EVENEMENT_DECISION_JUSTIFICATIF,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import { createDatabase, justificatif, newId, organisation, personne } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { signalerDecisionJustificatif } from '../src/decision-justificatif.js';

const app = createDatabase(inject('appUrl'), { max: 2 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const ecole = newId();
const lou = newId();
const justificatifId = newId();

const evenement = (): EvenementJob => ({
  id: newId(),
  organisationId: ecole,
  type: EVENEMENT_DECISION_JUSTIFICATIF,
  charge: { justificatifId },
  survenuLe: new Date().toISOString(),
});
const envois: { email: EmailJob; cle: string }[] = [];
const envoyer = (email: EmailJob, cle: string) => {
  envois.push({ email, cle });
  return Promise.resolve();
};

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des justificatifs', nomAffichage: 'EJ' });
  await owner.db.insert(personne).values({
    id: lou,
    organisationId: ecole,
    nom: 'Fictif',
    prenom: 'Lou',
    email: `lou.${lou}@exemple.test`,
  });
  await owner.db.insert(justificatif).values({
    id: justificatifId,
    organisationId: ecole,
    personneId: lou,
    motif: 'maladie',
    deposeLe: new Date(),
    deposePar: lou,
    horsDelai: false,
    statut: 'refuse',
    messageChiffre: 'v1.message-chiffre-fictif',
    decideLe: new Date(),
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('Décision sur un justificatif (RG-06-21)', () => {
  it('RG-06-21 avertit l’apprenant de la décision, sans motif ni message', async () => {
    const e = evenement();
    expect(
      await signalerDecisionJustificatif(app.db, e, envoyer, 'https://ecole.exemple.test'),
    ).toBe(1);
    const [envoi] = envois;
    expect(envoi?.cle).toBe(`decision-justificatif-${e.id}`);
    expect(envoi?.email.to).toBe(`lou.${lou}@exemple.test`);
    expect(envoi?.email.subject).toBe('Justificatif d’absence refusé · École des justificatifs');
    expect(envoi?.email.text).toContain('https://ecole.exemple.test/mes-absences');
    expect(envoi?.email.text).not.toMatch(/maladie|message-chiffre/i);
  });

  it('un justificatif repassé « à traiter » n’envoie rien', async () => {
    await owner.db
      .update(justificatif)
      .set({ statut: 'a-traiter', decideLe: null })
      .where(eq(justificatif.id, justificatifId));
    envois.length = 0;
    expect(
      await signalerDecisionJustificatif(
        app.db,
        evenement(),
        envoyer,
        'https://ecole.exemple.test',
      ),
    ).toBe(0);
    expect(envois).toHaveLength(0);
  });
});
