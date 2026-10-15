import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type AlerteAssiduite,
  type MesAbsences,
  type SuiviAssiduite,
  type TableauAssiduite,
} from '@scolaly/contracts';
import {
  absence,
  alerteAssiduite,
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
  inscription,
  inscriptionStatut,
  inscrireManquants,
  newId,
  organisation,
  personne,
  promotionTechnique,
  role,
  salle,
  seance,
  seanceIntervenant,
  seancePublic,
} from '@scolaly/db';
import { instantLocal, jourLocal } from '@scolaly/domain';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de l’assiduité';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const FUSEAU = 'Europe/Paris';
// Hier, dans le fuseau de l'établissement : cours du matin (promotion A), de l'après-midi (B).
const hier = jourLocal(new Date(Date.now() - 24 * 3600_000), FUSEAU);
const seanceMatin = newId();
const seanceApresMidi = newId();
const fiches: Record<string, string> = {};
const cookies: Record<string, string> = {};
const promotions: Record<string, string> = {};

async function compte(
  nom: string,
  code: string,
  perimetre: { type: 'soi' | 'organisation' | 'promotion'; id?: string } = { type: 'soi' },
) {
  const email = `${nom}.assiduite@exemple.test`;
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({
      organisationId: ecole,
      nom: 'Fictif',
      prenom: nom,
      email,
      userId,
      compteEtat: 'actif',
    })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: perimetre.type,
    perimetreId: perimetre.id ?? null,
    debut: '2026-01-01',
  });
  fiches[nom] = fiche?.id ?? '';
  cookies[nom] = await signInCookie(app, email, PASSWORD, {
    doubleAuthentification: code === 'scolarite',
  });
}

const appeler = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN, 'user-agent': 'Navigateur fictif' },
    ...(payload ? { payload } : {}),
  });
const marquer = (seanceId: string, nom: string, corps: unknown) =>
  appeler(
    'PUT',
    `/api/seances/${seanceId}/appel/presences/${fiches[nom] ?? ''}`,
    cookies.iris ?? '',
    corps,
  );
const valider = (seanceId: string) =>
  appeler('POST', `/api/seances/${seanceId}/appel/validation`, cookies.iris ?? '', {});
const suivi = async (nom: string, filtre = '') => {
  const reponse = await appeler('GET', `/api/assiduite${filtre}`, cookies[nom] ?? '');
  expect(reponse.statusCode).toBe(200);
  return reponse.json<SuiviAssiduite>();
};
const miennes = async (nom: string) => {
  const reponse = await appeler('GET', '/api/moi/absences', cookies[nom] ?? '');
  expect(reponse.statusCode).toBe(200);
  return reponse.json<MesAbsences>();
};

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de l’assiduité', nomAffichage: 'EAS' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus fictif', fuseauHoraire: FUSEAU })
    .returning();
  const [laSalle] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Salle 1' })
    .returning();
  promotions.a = await promotionTechnique(owner.db, ecole, 'Promotion A');
  promotions.b = await promotionTechnique(owner.db, ecole, 'Promotion B');
  await compte('iris', 'intervenant');
  await compte('sacha', 'scolarite', { type: 'organisation' });
  await compte('paul', 'responsable-pedagogique', { type: 'promotion', id: promotions.a });
  for (const nom of ['lou', 'max', 'zoe', 'eli']) await compte(nom, 'apprenant');
  await inscrireManquants(
    owner.db,
    ecole,
    promotions.a,
    ['lou', 'max', 'zoe'].map((n) => fiches[n] ?? ''),
  );
  await inscrireManquants(owner.db, ecole, promotions.b, [fiches.eli ?? '']);
  // Zoé est apprentie.
  const [insZoe] = await owner.db
    .select()
    .from(inscription)
    .where(eq(inscription.personneId, fiches.zoe ?? ''));
  await owner.db.insert(inscriptionStatut).values({
    organisationId: ecole,
    inscriptionId: insZoe?.id ?? '',
    statut: 'apprenti',
    debut: '2020-01-01',
  });
  const creneaux = [
    [seanceMatin, 'Algorithmique', '09:00', '12:00', promotions.a],
    [seanceApresMidi, 'Réseaux', '14:00', '17:00', promotions.b],
  ] as const;
  for (const [id, libelle, debut, fin, promotionId] of creneaux) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle,
      debut: instantLocal(hier, debut, FUSEAU),
      fin: instantLocal(hier, fin, FUSEAU),
      salleId: laSalle?.id ?? null,
    });
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId: id, personneId: fiches.iris ?? '' });
    await owner.db
      .insert(seancePublic)
      .values({ organisationId: ecole, seanceId: id, promotionId });
  }
  // Lou en retard, Max absent, Zoé jamais scannée : absente à la validation.
  await marquer(seanceMatin, 'lou', { statut: 'retard', minutesRetard: 20 });
  await marquer(seanceMatin, 'max', { statut: 'absent', minutesRetard: null });
  expect((await valider(seanceMatin)).statusCode).toBe(200);
  await marquer(seanceApresMidi, 'eli', { statut: 'absent', minutesRetard: null });
  expect((await valider(seanceApresMidi)).statusCode).toBe(200);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-06-16 à RG-06-18 calcul à la validation de l’appel', () => {
  it('RG-06-16 la validation enregistre retards et absences, non justifiés, avec leurs demi-journées', async () => {
    const lignes = await owner.db.select().from(absence).where(eq(absence.seanceId, seanceMatin));
    const parPrenom: Record<string, (typeof lignes)[number]> = {};
    for (const l of lignes)
      parPrenom[Object.keys(fiches).find((n) => fiches[n] === l.personneId) ?? ''] = l;
    expect(Object.keys(parPrenom).sort()).toEqual(['lou', 'max', 'zoe']);
    expect(parPrenom.lou).toMatchObject({ nature: 'retard', minutes: 20, matin: true });
    expect(parPrenom.max).toMatchObject({
      nature: 'absence',
      minutes: 180,
      jour: hier,
      matin: true,
      apresMidi: false,
      statut: 'non-justifiee',
      versionAppel: 1,
    });
    expect(parPrenom.zoe).toMatchObject({ nature: 'absence', minutes: 180 });
  });

  it('RG-06-15 une correction recalcule les absences de la séance et trace l’avant et l’après', async () => {
    const correction = await marquer(seanceMatin, 'max', {
      statut: 'present',
      minutesRetard: null,
      motif: 'Présent au fond de la salle',
    });
    expect(correction.statusCode).toBe(200);
    const restantes = await owner.db
      .select({ personneId: absence.personneId, versionAppel: absence.versionAppel })
      .from(absence)
      .where(eq(absence.seanceId, seanceMatin));
    expect(restantes.map((r) => r.personneId)).not.toContain(fiches.max);
    expect(restantes).toHaveLength(2);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.action, 'absence.recalculer'))
      .orderBy(desc(auditEvenement.id))
      .limit(1);
    expect(trace?.objetId).toBe(seanceMatin);
    expect(trace?.avant).toEqual({
      absences: [{ personneId: fiches.max, nature: 'absence', minutes: 180 }],
    });
    expect(trace?.apres).toEqual({ version: 2, absences: [] });
  });
});

describe('US-06-13 Mes absences', () => {
  it('US-06-13 l’apprenant voit ses absences et son décompte en heures et demi-journées', async () => {
    const zoe = await miennes('zoe');
    expect(zoe.absences).toHaveLength(1);
    expect(zoe.absences[0]).toMatchObject({
      libelle: 'Algorithmique',
      nature: 'absence',
      statut: 'non-justifiee',
    });
    expect(zoe.decompte).toMatchObject({ absences: 1, minutesAbsence: 180, demiJournees: 1 });
    // RG-03-15 : l'alternant a le décompte utile à son suivi.
    expect(zoe.alternant).toBe(true);
    const lou = await miennes('lou');
    expect(lou.alternant).toBe(false);
    expect(lou.decompte).toMatchObject({ retards: 1, minutesRetard: 20, demiJournees: 0 });
    expect((await miennes('max')).absences).toEqual([]);
  });

  it('US-06-13 un intervenant sans absence a une liste vide', async () => {
    expect((await miennes('iris')).absences).toEqual([]);
  });
});

describe('E-06-07 suivi de l’assiduité', () => {
  it('E-06-07 la scolarité voit toute l’école, filtrable par promotion, nature et période', async () => {
    const tout = await suivi('sacha');
    expect(tout.promotions.map((p) => p.libelle)).toEqual(['Promotion A', 'Promotion B']);
    expect(tout.absences).toHaveLength(3);
    expect(tout.apprenants.map((a) => a.prenom).sort()).toEqual(['eli', 'lou', 'zoe']);
    expect(tout.apprenants.find((a) => a.prenom === 'zoe')).toMatchObject({
      promotion: 'Promotion A',
      alternant: true,
      decompte: { demiJourneesNonJustifiees: 1 },
    });
    const b = await suivi('sacha', `?promotionId=${promotions.b ?? ''}`);
    expect(b.absences.map((a) => a.prenom)).toEqual(['eli']);
    expect(b.absences[0]).toMatchObject({ apresMidi: true, matin: false });
    const retards = await suivi('sacha', '?nature=retard');
    expect(retards.absences.map((a) => a.prenom)).toEqual(['lou']);
    expect((await suivi('sacha', `?du=${hier}&au=${hier}`)).absences).toHaveLength(3);
    expect((await suivi('sacha', '?au=2020-01-01')).absences).toEqual([]);
    expect((await suivi('sacha', '?statut=non-justifiee')).absences).toHaveLength(3);
  });

  it('RG-00-10 le responsable pédagogique ne voit que son périmètre', async () => {
    const paul = await suivi('paul');
    expect(paul.promotions.map((p) => p.libelle)).toEqual(['Promotion A']);
    expect(paul.absences.map((a) => a.prenom).sort()).toEqual(['lou', 'zoe']);
    const horsPerimetre = await suivi('paul', `?promotionId=${promotions.b ?? ''}`);
    expect(horsPerimetre.absences).toEqual([]);
  });

  it('RG-00-10 un apprenant et un intervenant n’ont pas accès au suivi', async () => {
    expect((await appeler('GET', '/api/assiduite', cookies.lou ?? '')).statusCode).toBe(403);
    expect((await appeler('GET', '/api/assiduite', cookies.iris ?? '')).statusCode).toBe(403);
  });

  it('refuse un filtre mal formé', async () => {
    const reponse = await appeler('GET', '/api/assiduite?du=hier', cookies.sacha ?? '');
    expect(reponse.statusCode).toBe(400);
  });
});

describe('US-06-10 tableau de bord de l’assiduité', () => {
  const tableau = async (nom: string, filtre = '') => {
    const reponse = await appeler(
      'GET',
      `/api/assiduite/tableau-de-bord${filtre}`,
      cookies[nom] ?? '',
    );
    expect(reponse.statusCode, reponse.body).toBe(200);
    return reponse.json<TableauAssiduite>();
  };

  it('US-06-10 sous les seuils par défaut, aucun apprenant n’est signalé', async () => {
    const t = await tableau('sacha');
    expect(t.apprenants).toEqual([]);
    expect(t.indicateurs).toMatchObject({ niveau1: 0, niveau2: 0, alertesOuvertes: 0 });
    expect(t.traitable).toBe(true);
  });

  it('RG-06-23 signale les apprenants au-dessus des seuils de l’école, avec leur niveau', async () => {
    await owner.db
      .update(organisation)
      .set({ assiduiteSeuilNiveau1: 1, assiduiteSeuilNiveau2: 2, assiduiteFenetreJours: 30 })
      .where(eq(organisation.id, ecole));
    const t = await tableau('sacha');
    expect(t.apprenants.map((a) => [a.prenom, a.niveau, a.demiJourneesNonJustifiees])).toEqual([
      ['eli', 1, 1],
      ['zoe', 1, 1],
    ]);
    expect(t.apprenants[1]).toMatchObject({ alternant: true, promotion: 'Promotion A' });
    expect(t.indicateurs).toMatchObject({ niveau1: 2, niveau2: 0, demiJourneesNonJustifiees: 2 });
    expect((await tableau('sacha', '?niveau=2')).apprenants).toEqual([]);
    const b = await tableau('sacha', `?promotionId=${promotions.b ?? ''}`);
    expect(b.apprenants.map((a) => a.prenom)).toEqual(['eli']);
  });

  it('RG-00-10 le responsable pédagogique ne voit que son périmètre ; l’apprenant n’y a pas accès', async () => {
    expect((await tableau('paul')).apprenants.map((a) => a.prenom)).toEqual(['zoe']);
    const refus = await appeler('GET', '/api/assiduite/tableau-de-bord', cookies.lou ?? '');
    expect(refus.statusCode).toBe(403);
  });

  it('RG-06-23 une alerte ouverte se traite une fois, dans le périmètre, avec audit', async () => {
    const [alerte] = await owner.db
      .insert(alerteAssiduite)
      .values({
        organisationId: ecole,
        personneId: fiches.eli ?? '',
        niveau: 1,
        declencheeLe: new Date(),
        demiJournees: 1,
        seuil: 1,
        fenetreJours: 30,
        notifieeLe: new Date(),
      })
      .returning();
    const id = alerte?.id ?? '';
    const avec = await tableau('sacha', '?alertes=ouvertes');
    expect(avec.apprenants.map((a) => [a.prenom, a.alertes.length])).toEqual([['eli', 1]]);
    expect(avec.indicateurs.alertesOuvertes).toBe(1);
    // Paul (promotion A) ne traite pas l'alerte d'Éli (promotion B).
    const horsPerimetre = await appeler(
      'POST',
      `/api/assiduite/alertes/${id}/traitement`,
      cookies.paul ?? '',
    );
    expect(horsPerimetre.statusCode).toBe(404);
    const reponse = await appeler(
      'POST',
      `/api/assiduite/alertes/${id}/traitement`,
      cookies.sacha ?? '',
    );
    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(reponse.json<AlerteAssiduite>()).toMatchObject({ statut: 'traitee', niveau: 1 });
    const encore = await appeler(
      'POST',
      `/api/assiduite/alertes/${id}/traitement`,
      cookies.sacha ?? '',
    );
    expect(encore.json<AlerteAssiduite>().statut).toBe('traitee');
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, id), eq(auditEvenement.action, 'alerte-assiduite.traiter')),
      );
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ avant: { statut: 'ouverte' }, apres: { statut: 'traitee' } });
    expect((await tableau('sacha', '?alertes=ouvertes')).apprenants).toEqual([]);
  });
});
