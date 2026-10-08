import { EVENEMENT_CHANGEMENT_EDT, type EmailJob, type EvenementJob } from '@scolaly/contracts';
import {
  createDatabase,
  newId,
  notificationEdt,
  organisation,
  personne,
  seance,
  seanceAttendu,
  seanceIntervenant,
} from '@scolaly/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { enregistrerChangementEdt, envoyerNotificationsEdt } from '../src/notifications-edt.js';

const app = createDatabase(inject('appUrl'), { max: 4 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const ecole = newId();
const HEURE = 3600_000;
const maintenant = new Date();
const plus = (ms: number) => new Date(maintenant.getTime() + ms);
const fiches = { lou: newId(), sam: newId(), ancien: newId() };
const seances = { proche: newId(), lointaine: newId(), passee: newId(), nouvelle: newId() };

const evenement = (charge: unknown): EvenementJob => ({
  id: newId(),
  organisationId: ecole,
  type: EVENEMENT_CHANGEMENT_EDT,
  charge,
  survenuLe: maintenant.toISOString(),
});

const envois: { email: EmailJob; cle: string }[] = [];
const envoyer = (email: EmailJob, cle: string) => {
  envois.push({ email, cle });
  return Promise.resolve();
};
const lignes = () =>
  owner.db.select().from(notificationEdt).where(eq(notificationEdt.organisationId, ecole));

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des notifications', nomAffichage: 'EN' });
  for (const [prenom, id] of Object.entries(fiches))
    await owner.db.insert(personne).values({
      id,
      organisationId: ecole,
      nom: 'Fictif',
      prenom,
      email: `${prenom}.${id}@exemple.test`,
    });
  const creneau = (debut: Date) => ({ debut, fin: new Date(debut.getTime() + 2 * HEURE) });
  await owner.db.insert(seance).values([
    {
      id: seances.proche,
      organisationId: ecole,
      libelle: 'Droit du travail',
      statut: 'publiee',
      ...creneau(plus(24 * HEURE)),
    },
    {
      id: seances.lointaine,
      organisationId: ecole,
      libelle: 'Comptabilité',
      statut: 'publiee',
      ...creneau(plus(5 * 24 * HEURE)),
    },
    {
      id: seances.passee,
      organisationId: ecole,
      libelle: 'Marketing',
      statut: 'publiee',
      ...creneau(plus(-5 * HEURE)),
    },
    {
      id: seances.nouvelle,
      organisationId: ecole,
      libelle: 'Droit du travail',
      statut: 'publiee',
      ...creneau(plus(10 * 24 * HEURE)),
    },
  ]);
  for (const seanceId of [seances.proche, seances.lointaine, seances.passee, seances.nouvelle]) {
    await owner.db
      .insert(seanceAttendu)
      .values({ organisationId: ecole, seanceId, personneId: fiches.lou });
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId, personneId: fiches.sam });
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-04-14 notifications des changements de l’emploi du temps', () => {
  const modification = evenement({
    nature: 'modification',
    seanceIds: [seances.proche, seances.lointaine, seances.passee],
    retraits: [{ seanceId: seances.proche, personneId: fiches.ancien }],
  });

  it('RG-04-14 note le changement pour les apprenants, intervenants et intervenants retirés', async () => {
    expect(await enregistrerChangementEdt(app.db, modification, maintenant)).toBe(5);
    const notees = await lignes();
    expect(notees.filter((l) => l.seanceId === seances.passee)).toEqual([]);
    expect(
      notees
        .filter((l) => l.seanceId === seances.proche)
        .map((l) => [l.personneId, l.nature, l.urgente])
        .sort(),
    ).toEqual(
      [
        [fiches.lou, 'modification', true],
        [fiches.sam, 'modification', true],
        [fiches.ancien, 'retrait', true],
      ].sort(),
    );
    expect(notees.filter((l) => l.seanceId === seances.lointaine).every((l) => !l.urgente)).toBe(
      true,
    );
  });

  it('RG-04-14 un événement rejoué ne crée aucun doublon', async () => {
    expect(await enregistrerChangementEdt(app.db, modification, maintenant)).toBe(0);
    expect(await lignes()).toHaveLength(5);
  });

  it('RG-08-11 attend la fin de la rafale avant l’envoi immédiat', async () => {
    expect(
      await envoyerNotificationsEdt(
        app.db,
        envoyer,
        'http://localhost:3000',
        'immediat',
        new Date(),
      ),
    ).toBe(0);
  });

  it('RG-04-14 envoie aussitôt un seul email par personne pour les séances des 48 heures', async () => {
    const envoyes = await envoyerNotificationsEdt(
      app.db,
      envoyer,
      'http://localhost:3000',
      'immediat',
      plus(3 * 60_000),
    );
    expect(envoyes).toBe(3);
    const pour = (id: string) => envois.find((e) => e.email.to.includes(id));
    expect(pour(fiches.lou)?.email.text).toContain('Séance modifiée · Droit du travail');
    expect(pour(fiches.lou)?.email.text).not.toContain('Comptabilité');
    expect(pour(fiches.ancien)?.email.text).toContain('Vous n’intervenez plus sur cette séance');
    expect(pour(fiches.sam)?.email.subject).toBe(
      'Changement de votre emploi du temps · École des notifications',
    );
    // Seuls les changements au-delà de 48 heures restent, pour le récapitulatif.
    expect((await lignes()).map((l) => l.seanceId)).toEqual([seances.lointaine, seances.lointaine]);
  });

  it('RG-04-14 regroupe les autres changements dans le récapitulatif quotidien', async () => {
    envois.length = 0;
    expect(
      await envoyerNotificationsEdt(
        app.db,
        envoyer,
        'http://localhost:3000',
        'recapitulatif',
        plus(6 * HEURE),
      ),
    ).toBe(2);
    expect(envois.every((e) => e.email.subject.startsWith('Récapitulatif'))).toBe(true);
    expect(envois[0]?.email.text).toContain('Comptabilité');
    expect(envois[0]?.cle).toMatch(/^edt-[0-9a-f]{32}$/);
    expect(await lignes()).toEqual([]);
  });

  it('RG-04-14 annonce un report avec son nouveau créneau, urgent si l’ancien est proche', async () => {
    envois.length = 0;
    await owner.db
      .update(seance)
      .set({ statut: 'reportee', motifAnnulation: 'Imprévu', reporteeVersId: seances.nouvelle })
      .where(eq(seance.id, seances.proche));
    await enregistrerChangementEdt(
      app.db,
      evenement({ nature: 'report', seanceIds: [seances.proche] }),
      maintenant,
    );
    expect((await lignes()).every((l) => l.urgente && l.seanceId === seances.proche)).toBe(true);
    await envoyerNotificationsEdt(
      app.db,
      envoyer,
      'http://localhost:3000',
      'immediat',
      plus(3 * 60_000),
    );
    const lou = envois.find((e) => e.email.to.includes(fiches.lou));
    expect(lou?.email.text).toContain('Séance reportée · Droit du travail');
    expect(lou?.email.text).toContain('reportée au');
    expect(lou?.email.text).not.toContain('Imprévu');
  });
});
