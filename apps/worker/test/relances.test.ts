import type { EmailJob } from '@scolaly/contracts';
import { createDatabase, invitation, newId, organisation, personne } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { relancerInvitations } from '../src/relances.js';

const app = createDatabase(inject('appUrl'), { max: 2 });
const owner = createDatabase(inject('migratorUrl'), { max: 1 });
const JOUR = 86_400_000;

afterAll(async () => {
  await Promise.all([app.close(), owner.close()]);
});

async function invitationEnvoyee(ilYA: number, relances = 0) {
  const organisationId = newId();
  await owner.db
    .insert(organisation)
    .values({ id: organisationId, nom: 'École des relances', nomAffichage: 'ER' });
  const email = `lina.${newId()}@exemple.test`;
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom: 'Fictive', prenom: 'Lina', email, compteEtat: 'invite' })
    .returning();
  const envoyeeLe = new Date(Date.now() - ilYA * JOUR);
  const [ligne] = await owner.db
    .insert(invitation)
    .values({
      organisationId,
      personneId: fiche?.id ?? '',
      jetonEmpreinte: `empreinte-${newId()}`,
      email,
      envoyeeLe,
      expireLe: new Date(envoyeeLe.getTime() + 14 * JOUR),
      relances,
    })
    .returning();
  return { id: ligne?.id ?? '', email, organisationId, empreinte: ligne?.jetonEmpreinte };
}

describe('RG-01-08 relances des invitations', () => {
  it('relance à J+3 avec un nouveau lien, une seule fois', async () => {
    const cible = await invitationEnvoyee(3.1);
    const recus: EmailJob[] = [];
    const envoyer = (email: EmailJob) => Promise.resolve(void recus.push(email));
    await relancerInvitations(app.db, envoyer, 'https://scolaly.exemple.test');
    const miens = recus.filter((e) => e.to === cible.email);
    expect(miens).toHaveLength(1);
    expect(miens[0]?.subject).toBe('Rappel : Activez votre compte Scolaly · École des relances');
    expect(miens[0]?.text).toContain(
      `https://scolaly.exemple.test/activation/${cible.organisationId}.`,
    );
    const [apres] = await owner.db.select().from(invitation).where(eq(invitation.id, cible.id));
    expect(apres?.relances).toBe(1);
    expect(apres?.jetonEmpreinte).not.toBe(cible.empreinte);

    recus.length = 0;
    await relancerInvitations(app.db, envoyer, 'https://scolaly.exemple.test');
    expect(recus.filter((e) => e.to === cible.email)).toHaveLength(0);
  });

  it('relance une seconde fois à J+7, jamais avant J+3 ni après expiration', async () => {
    const seconde = await invitationEnvoyee(7.1, 1);
    const tropTot = await invitationEnvoyee(1);
    const expiree = await invitationEnvoyee(15);
    const recus: EmailJob[] = [];
    await relancerInvitations(
      app.db,
      (e) => Promise.resolve(void recus.push(e)),
      'https://scolaly.exemple.test',
    );
    expect(recus.filter((e) => e.to === seconde.email)).toHaveLength(1);
    expect(recus.filter((e) => e.to === tropTot.email || e.to === expiree.email)).toHaveLength(0);
  });
});
