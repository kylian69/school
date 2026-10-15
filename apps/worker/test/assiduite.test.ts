import { ROLES_PAR_DEFAUT, type EmailJob } from '@scolaly/contracts';
import {
  absence,
  alerteAssiduite,
  anneeScolaire,
  attribution,
  createDatabase,
  etablissement,
  formation,
  initialiserRolesParDefaut,
  inscription,
  maquetteVersion,
  newId,
  organisation,
  personne,
  promotion,
  role,
  seance,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { declencherAlertesAssiduite } from '../src/assiduite.js';

const app = createDatabase(inject('appUrl'), { max: 2 });
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const ecole = newId();
const formationId = newId();
const autreFormation = newId();
const fiches = {
  lea: newId(),
  max: newId(),
  tom: newId(),
  sacha: newId(),
  diane: newId(),
  paul: newId(),
};
const maintenant = new Date();
const jour = (ilYA: number) =>
  new Date(maintenant.getTime() - ilYA * 86_400_000).toISOString().slice(0, 10);
const envois: { email: EmailJob; cle: string }[] = [];
const envoyer = (email: EmailJob, cle: string) => {
  envois.push({ email, cle });
  return Promise.resolve();
};
const declencher = () =>
  declencherAlertesAssiduite(app.db, envoyer, 'http://localhost:3000', maintenant);

async function attribuer(
  nom: keyof typeof fiches,
  code: string,
  perimetreType: 'organisation' | 'formation',
  perimetreId: string | null = null,
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
    perimetreId,
    debut: '2020-01-01',
  });
}

/** Absences d'une journée entière (2 demi-journées) ou d'un matin, il y a `ilYA` jours. */
async function absent(
  nom: keyof typeof fiches,
  ilYA: number,
  journee: boolean,
  statut: 'non-justifiee' | 'justifiee' = 'non-justifiee',
) {
  const seanceId = newId();
  await owner.db.insert(seance).values({
    id: seanceId,
    organisationId: ecole,
    libelle: 'Séance fictive',
    debut: new Date(`${jour(ilYA)}T08:00:00Z`),
    fin: new Date(`${jour(ilYA)}T${journee ? '15' : '10'}:00:00Z`),
  });
  await owner.db.insert(absence).values({
    organisationId: ecole,
    seanceId,
    personneId: fiches[nom],
    nature: 'absence',
    statut,
    minutes: 120,
    jour: jour(ilYA),
    matin: true,
    apresMidi: journee,
    versionAppel: 1,
  });
}

beforeAll(async () => {
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des seuils', nomAffichage: 'ES' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  for (const [prenom, id] of Object.entries(fiches))
    await owner.db.insert(personne).values({
      id,
      organisationId: ecole,
      nom: 'Fictif',
      prenom,
      email: `${prenom}.${id}@exemple.test`,
    });
  const anneeScolaireId = newId();
  await owner.db.insert(anneeScolaire).values({
    id: anneeScolaireId,
    organisationId: ecole,
    libelle: 'Année fictive',
    dateDebut: '2020-09-01',
    dateFin: '2099-08-31',
  });
  const etablissementId = newId();
  await owner.db
    .insert(etablissement)
    .values({ id: etablissementId, organisationId: ecole, nom: 'Campus fictif' });
  const promotionId = newId();
  for (const id of [formationId, autreFormation]) {
    await owner.db.insert(formation).values({
      id,
      organisationId: ecole,
      intitule: 'Bachelor fictif',
      type: 'bachelor',
      niveau: 6,
      dureeAnnees: 3,
      modes: ['initial'],
    });
  }
  const versionId = newId();
  await owner.db
    .insert(maquetteVersion)
    .values({ id: versionId, organisationId: ecole, formationId, numero: 1, regles: {} });
  await owner.db.insert(promotion).values({
    id: promotionId,
    organisationId: ecole,
    formationId,
    versionId,
    anneeFormation: 1,
    anneeScolaireId,
    etablissementId,
    libelle: 'Promotion fictive',
    dateDebut: '2020-09-01',
    dateFin: '2099-06-30',
  });
  for (const nom of ['lea', 'max', 'tom'] as const)
    await owner.db.insert(inscription).values({
      organisationId: ecole,
      personneId: fiches[nom],
      promotionId,
      dateEntree: '2020-09-01',
    });
  await attribuer('sacha', 'scolarite', 'organisation');
  await attribuer('diane', 'direction', 'organisation');
  // Responsable d'une autre formation : hors périmètre.
  await attribuer('paul', 'responsable-pedagogique', 'formation', autreFormation);
  // Léa : 3 demi-journées non justifiées (une hors période de 30 jours) → niveau 1.
  await absent('lea', 2, true);
  await absent('lea', 5, false);
  await absent('lea', 40, true);
  // Max : 6 demi-journées → niveau 2.
  for (const ilYA of [1, 3, 6]) await absent('max', ilYA, true);
  // Tom : 2 non justifiées, 2 justifiées → sous le seuil par défaut.
  await absent('tom', 1, true);
  await absent('tom', 4, true, 'justifiee');
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-06-23 alertes d’assiduité', () => {
  it('RG-06-23 alerte la scolarité aux deux niveaux et la direction au seul niveau 2', async () => {
    const bilan = await declencher();
    expect(bilan).toEqual({ alertes: 3, emails: 2 });
    const alertes = await owner.db
      .select()
      .from(alerteAssiduite)
      .where(eq(alerteAssiduite.organisationId, ecole));
    expect(
      alertes.map((a) => [a.personneId, a.niveau, a.demiJournees, a.seuil, a.fenetreJours]).sort(),
    ).toEqual(
      [
        [fiches.lea, 1, 3, 3, 30],
        [fiches.max, 1, 6, 3, 30],
        [fiches.max, 2, 6, 6, 30],
      ].sort(),
    );
    expect(alertes.every((a) => a.notifieeLe !== null && a.statut === 'ouverte')).toBe(true);
    const pour = (nom: keyof typeof fiches) =>
      envois.find((e) => e.email.to.startsWith(`${nom}.`))?.email;
    expect(pour('sacha')?.text).toContain('1 apprenant a atteint le premier seuil');
    expect(pour('sacha')?.text).toContain('1 apprenant a atteint le second seuil');
    expect(pour('diane')?.text).not.toContain('premier seuil');
    expect(pour('diane')?.text).toContain('second seuil');
    expect(pour('paul')).toBeUndefined();
    // Minimisation : aucun nom d'apprenant dans l'email.
    expect(pour('sacha')?.text).not.toContain('Fictif');
  });

  it('RG-06-23 ne répète ni alerte ni email au passage suivant', async () => {
    envois.length = 0;
    expect(await declencher()).toEqual({ alertes: 0, emails: 0 });
    expect(envois).toEqual([]);
  });

  it('RG-06-23 applique les seuils propres à la formation', async () => {
    await owner.db
      .update(formation)
      .set({ assiduiteSeuilNiveau1: 2, assiduiteSeuilNiveau2: 10, assiduiteFenetreJours: 30 })
      .where(eq(formation.id, formationId));
    envois.length = 0;
    expect(await declencher()).toEqual({ alertes: 1, emails: 1 });
    const [tom] = await owner.db
      .select()
      .from(alerteAssiduite)
      .where(eq(alerteAssiduite.personneId, fiches.tom));
    expect(tom).toMatchObject({ niveau: 1, demiJournees: 2, seuil: 2 });
    expect(envois[0]?.email.to).toContain('sacha.');
  });
});
