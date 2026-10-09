import { EVENEMENT_CHANGEMENT_EDT, type EmailJob, type EvenementJob } from '@scolaly/contracts';
import {
  anneeScolaire,
  createDatabase,
  etablissement,
  formation,
  maquetteVersion,
  newId,
  notificationEdt,
  organisation,
  personne,
  promotion,
  seance,
  seanceAttendu,
  seanceIntervenant,
  seancePublic,
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
        // 18 h passe dans les 25 heures qui suivent, même un jour de changement d'heure.
        plus(25 * HEURE),
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

describe('RG-04-14 récapitulatif à 18 h dans le fuseau de l’établissement', () => {
  const autre = newId();
  const eva = newId();
  const ids = { paris: newId(), martinique: newId(), commune: newId(), tardive: newId() };
  // 2 novembre 2026 : Paris en UTC+1, Martinique en UTC-4 ; changements notés à 13 h à Paris.
  const note = new Date('2026-11-02T12:00:00Z');
  const recus = () => envois.filter((e) => e.email.to.includes(eva));
  const recapitulatif = (instant: string) =>
    envoyerNotificationsEdt(
      app.db,
      envoyer,
      'http://localhost:3000',
      'recapitulatif',
      new Date(instant),
    );

  beforeAll(async () => {
    await owner.db
      .insert(organisation)
      .values({ id: autre, nom: 'École des fuseaux', nomAffichage: 'EF' });
    await owner.db.insert(personne).values({
      id: eva,
      organisationId: autre,
      nom: 'Fictif',
      prenom: 'Eva',
      email: `eva.${eva}@exemple.test`,
    });
    const anneeScolaireId = newId();
    await owner.db.insert(anneeScolaire).values({
      id: anneeScolaireId,
      organisationId: autre,
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
    });
    const formationId = newId();
    await owner.db.insert(formation).values({
      id: formationId,
      organisationId: autre,
      intitule: 'Bachelor fictif',
      type: 'bachelor',
      niveau: 6,
      dureeAnnees: 3,
      modes: ['initial'],
    });
    const versionId = newId();
    await owner.db
      .insert(maquetteVersion)
      .values({ id: versionId, organisationId: autre, formationId, numero: 1, regles: {} });
    const promotions: Record<string, string> = {};
    for (const fuseauHoraire of ['Europe/Paris', 'America/Martinique']) {
      const etablissementId = newId();
      await owner.db
        .insert(etablissement)
        .values({ id: etablissementId, organisationId: autre, nom: fuseauHoraire, fuseauHoraire });
      promotions[fuseauHoraire] = newId();
      await owner.db.insert(promotion).values({
        id: promotions[fuseauHoraire],
        organisationId: autre,
        formationId,
        versionId,
        anneeFormation: 1,
        anneeScolaireId,
        etablissementId,
        libelle: `Promotion ${fuseauHoraire}`,
        dateDebut: '2026-09-01',
        dateFin: '2027-06-30',
      });
    }
    const publics: Record<string, string[]> = {
      [ids.paris]: ['Europe/Paris'],
      [ids.martinique]: ['America/Martinique'],
      [ids.commune]: ['Europe/Paris', 'America/Martinique'],
      [ids.tardive]: ['Europe/Paris'],
    };
    for (const [id, fuseaux] of Object.entries(publics)) {
      await owner.db.insert(seance).values({
        id,
        organisationId: autre,
        libelle: `Séance ${fuseaux.join(' et ')}`,
        statut: 'publiee',
        debut: new Date('2026-11-20T09:00:00Z'),
        fin: new Date('2026-11-20T11:00:00Z'),
      });
      for (const f of fuseaux)
        await owner.db
          .insert(seancePublic)
          .values({ organisationId: autre, seanceId: id, promotionId: promotions[f] });
      await owner.db.insert(notificationEdt).values({
        organisationId: autre,
        evenementId: newId(),
        personneId: eva,
        seanceId: id,
        nature: 'modification',
        urgente: false,
        // Changement noté à 18 h 30 à Paris : il attend le récapitulatif du lendemain.
        createdAt: id === ids.tardive ? new Date('2026-11-02T17:30:00Z') : note,
      });
    }
  });

  it('RG-04-14 envoie à 18 h à Paris les seules séances des établissements de Paris', async () => {
    envois.length = 0;
    // 17 h 45 à Paris : rien n'est encore dû.
    await recapitulatif('2026-11-02T16:45:00Z');
    expect(recus()).toEqual([]);
    await recapitulatif('2026-11-02T17:00:00Z');
    expect(recus()).toHaveLength(1);
    expect(recus()[0]?.email.text).toContain('Séance Europe/Paris');
    expect(recus()[0]?.email.text).not.toContain('Martinique');
  });

  it('RG-04-14 envoie à 18 h en Martinique les séances de la Martinique, chacune une seule fois', async () => {
    envois.length = 0;
    // Une séance dont le public couvre deux fuseaux relève du premier par ordre alphabétique.
    await recapitulatif('2026-11-02T22:00:00Z');
    expect(recus()).toHaveLength(1);
    expect(recus()[0]?.email.text).toContain('Séance America/Martinique');
    expect(recus()[0]?.email.text).toContain('Séance Europe/Paris et America/Martinique');
    expect(
      (
        await owner.db
          .select()
          .from(notificationEdt)
          .where(eq(notificationEdt.organisationId, autre))
      ).map((l) => l.seanceId),
    ).toEqual([ids.tardive]);
  });

  it('RG-04-14 garde un changement noté après 18 h pour le lendemain, sans doublon', async () => {
    envois.length = 0;
    await recapitulatif('2026-11-02T23:00:00Z');
    expect(recus()).toEqual([]);
    await recapitulatif('2026-11-03T17:00:00Z');
    await recapitulatif('2026-11-03T17:15:00Z');
    expect(recus()).toHaveLength(1);
    expect(recus()[0]?.email.text).toContain('Séance Europe/Paris');
  });
});
