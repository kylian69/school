import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
  genererJeton,
  ROLES_PAR_DEFAUT,
  type AppelEnDirect,
  type ApprenantsAjoutables,
  type CorrectionVerrouillee,
  EVENEMENT_CORRECTION_VERROUILLEE,
  type FeuilleAppel,
  type OuvertureAppel,
  type PresenceEnCache,
} from '@scolaly/contracts';
import {
  appelValidation,
  attribution,
  auditEvenement,
  createDatabase,
  enregistrerPresences,
  etablissement,
  groupeEleves,
  groupeMembre,
  initialiserRolesParDefaut,
  inscription,
  inscrireManquants,
  newId,
  organisation,
  outboxEvenement,
  personne,
  presence,
  promotionTechnique,
  role,
  rolePermission,
  salle,
  seance,
  seanceIntervenant,
  seancePublic,
} from '@scolaly/db';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH, VALKEY } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de la validation de l’appel';
const UA = 'Navigateur fictif de la validation';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const J = 24 * 3600_000;
const SUR_PLACE = { latitude: 45.75, longitude: 4.85, precisionMetres: 10 };
const seances = {
  enCours: newId(),
  tardive: newId(),
  avant3Jours: newId(),
  avant8Jours: newId(),
  avant10Jours: newId(),
  avant20Jours: newId(),
  demain: newId(),
};
const fiches: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function compte(nom: string, code: string, perimetreType: 'soi' | 'organisation' = 'soi') {
  const email = `${nom}.validation@exemple.test`;
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
    .where(
      and(eq(role.organisationId, ecole), or(eq(role.code, code), eq(sql`${role.id}::text`, code))),
    );
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType,
    debut: '2026-01-01',
  });
  fiches[nom] = fiche?.id ?? '';
  // RG-00-13 : la scolarité se connecte avec la double authentification.
  cookies[nom] = await signInCookie(app, email, PASSWORD, {
    doubleAuthentification: code === 'scolarite',
  });
}

const appeler = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN, 'user-agent': UA },
    ...(payload ? { payload } : {}),
  });

const marquer = (seanceId: string, nom: string, corps: unknown, cookie = cookies.iris) =>
  appeler(
    'PUT',
    `/api/seances/${seanceId}/appel/presences/${fiches[nom] ?? ''}`,
    cookie ?? '',
    corps,
  );
const valider = (seanceId: string, cookie = cookies.iris, corps: unknown = {}) =>
  appeler('POST', `/api/seances/${seanceId}/appel/validation`, cookie ?? '', corps);
const feuille = async (seanceId: string, version?: number) =>
  (
    await appeler(
      'GET',
      `/api/seances/${seanceId}/appel/feuille${version ? `?version=${String(version)}` : ''}`,
      cookies.iris ?? '',
    )
  ).json<FeuilleAppel>();
const ligne = (appel: AppelEnDirect, nom: string) =>
  appel.liste.find((l) => l.personneId === fiches[nom]);
const derniereTrace = async (action: string) =>
  (
    await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.action, action))
      .orderBy(desc(auditEvenement.id))
      .limit(1)
  )[0];

async function scanner(seanceId: string, nom: string, position?: unknown) {
  const ouverture = await appeler(
    'POST',
    `/api/seances/${seanceId}/appel/ouverture`,
    cookies.iris ?? '',
  );
  const { cle } = ouverture.json<OuvertureAppel>();
  const { jeton } = await genererJeton(Buffer.from(cle, 'base64url'), seanceId, Date.now());
  return appeler('POST', '/api/emargement/scan', cookies[nom] ?? '', {
    jeton,
    ...(position ? { position } : {}),
  });
}

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de la validation', nomAffichage: 'EVA' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({
      organisationId: ecole,
      nom: 'Campus fictif',
      localisationLatitude: 45.75,
      localisationLongitude: 4.85,
      localisationRayon: 300,
    })
    .returning();
  const [laSalle] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Salle 1' })
    .returning();
  await compte('iris', 'intervenant');
  await compte('sacha', 'scolarite', 'organisation');
  await compte('paul', 'responsable-pedagogique', 'organisation');
  // Intervenant d'un rôle personnalisé, sans le droit de corriger un appel verrouillé.
  const [sansDroit] = await owner.db
    .insert(role)
    .values({ organisationId: ecole, libelle: 'Vacataire', perimetreParDefaut: 'soi' })
    .returning();
  await owner.db.insert(rolePermission).values({
    organisationId: ecole,
    roleId: sansDroit?.id ?? '',
    permission: 'emargement:animer',
  });
  await compte('remi', sansDroit?.id ?? '');
  for (const nom of ['lou', 'max', 'zoe', 'nina', 'eli']) await compte(nom, 'apprenant');
  // Lou, Max et Zoé sont dans le groupe de la séance ; Nina est de la même promotion, dans un
  // autre groupe ; Éli est d'une autre promotion.
  const promo = await promotionTechnique(owner.db, ecole, 'Promotion validation');
  await inscrireManquants(
    owner.db,
    ecole,
    promo,
    ['lou', 'max', 'zoe', 'nina'].map((n) => fiches[n] ?? ''),
  );
  const autrePromo = await promotionTechnique(owner.db, ecole, 'Autre promotion validation');
  await inscrireManquants(owner.db, ecole, autrePromo, [fiches.eli ?? '']);
  const [groupe] = await owner.db
    .insert(groupeEleves)
    .values({ organisationId: ecole, libelle: 'TD 1', type: 'td' })
    .returning();
  for (const nom of ['lou', 'max', 'zoe']) {
    const [ins] = await owner.db
      .select()
      .from(inscription)
      .where(eq(inscription.personneId, fiches[nom] ?? ''));
    await owner.db.insert(groupeMembre).values({
      organisationId: ecole,
      groupeId: groupe?.id ?? '',
      inscriptionId: ins?.id ?? '',
      debut: '2020-01-01',
    });
  }
  const debuts = {
    enCours: Date.now() - 60_000,
    tardive: Date.now() - 10 * 60_000,
    avant3Jours: Date.now() - 3 * J - 2 * 3600_000,
    avant8Jours: Date.now() - 8 * J - 2 * 3600_000,
    avant10Jours: Date.now() - 10 * J - 2 * 3600_000,
    avant20Jours: Date.now() - 20 * J - 2 * 3600_000,
    demain: Date.now() + J,
  };
  for (const [cle, id] of Object.entries(seances) as [keyof typeof seances, string][]) {
    await owner.db.insert(seance).values({
      id,
      organisationId: ecole,
      libelle: `Séance ${cle}`,
      debut: new Date(debuts[cle]),
      fin: new Date(debuts[cle] + 2 * 3600_000),
      salleId: laSalle?.id ?? null,
    });
    for (const nom of ['iris', 'remi'])
      await owner.db
        .insert(seanceIntervenant)
        .values({ organisationId: ecole, seanceId: id, personneId: fiches[nom] ?? '' });
    await owner.db
      .insert(seancePublic)
      .values({ organisationId: ecole, seanceId: id, groupeId: groupe?.id ?? null });
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-06-01 états de l’appel', () => {
  it('RG-06-01 l’appel est à venir avant sa fenêtre, ouvert ensuite, verrouillé 7 jours après', async () => {
    expect((await feuille(seances.demain)).etat).toBe('a-venir');
    expect((await feuille(seances.enCours)).etat).toBe('ouvert');
    expect((await feuille(seances.avant8Jours)).etat).toBe('verrouille');
  });

  it('RG-06-01 un appel verrouillé jamais validé ne se modifie ni ne se valide plus, même par la scolarité', async () => {
    const corps = { statut: 'present', minutesRetard: null, motif: 'Oubli' };
    // RG-06-15 : sans version signée, le droit spécifique ne permet pas de corriger.
    expect((await marquer(seances.avant8Jours, 'lou', corps)).statusCode).toBe(409);
    expect((await marquer(seances.avant8Jours, 'lou', corps, cookies.sacha)).statusCode).toBe(409);
    expect((await marquer(seances.avant8Jours, 'lou', corps, cookies.remi)).statusCode).toBe(400);
    const refus = await valider(seances.avant8Jours);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toContain('verrouillé');
    expect((await valider(seances.demain)).statusCode).toBe(409);
  });
});

describe('RG-06-02, RG-06-11 scans tardifs et scans à vérifier', () => {
  it('RG-06-02 enregistre le retard d’un scan tardif avec la présence', async () => {
    expect((await scanner(seances.tardive, 'lou', SUR_PLACE)).statusCode).toBe(200);
    const l = ligne(await feuille(seances.tardive), 'lou');
    expect(l?.statut).toBe('retard');
    expect(l?.minutesRetard).toBeGreaterThanOrEqual(10);
    // Le worker écrit le retard en base avec la présence.
    const enCache = await app
      .get<Redis>(VALKEY)
      .hget(CLES_EMARGEMENT.presences(seances.tardive), fiches.lou ?? '');
    await enregistrerPresences(owner.db, [JSON.parse(enCache ?? '{}') as PresenceEnCache]);
    const [ecrite] = await owner.db
      .select()
      .from(presence)
      .where(
        and(eq(presence.seanceId, seances.tardive), eq(presence.personneId, fiches.lou ?? '')),
      );
    expect(ecrite?.retardMinutes).toBe(l?.minutesRetard);
  });

  it('RG-06-11 un scan à vérifier porte sa raison, puis la décision de l’intervenant', async () => {
    const hors = { latitude: 45.77, longitude: 4.85, precisionMetres: 15 };
    expect((await scanner(seances.enCours, 'max', hors)).statusCode).toBe(200);
    expect(ligne(await feuille(seances.enCours), 'max')).toMatchObject({
      statut: 'a-verifier',
      raison: 'hors-site',
      decision: null,
    });
    const retrait = await marquer(seances.enCours, 'max', {
      statut: 'absent',
      minutesRetard: null,
    });
    expect(ligne(retrait.json<AppelEnDirect>(), 'max')).toMatchObject({
      statut: 'absent',
      raison: 'hors-site',
      decision: 'retire',
    });
  });
});

describe('Apprenant non attendu ajouté par l’intervenant', () => {
  it('ajoute un apprenant de la même promotion et signale l’anomalie à la scolarité', async () => {
    const ajoutables = (
      await appeler('GET', `/api/seances/${seances.enCours}/appel/ajoutables`, cookies.iris ?? '')
    ).json<ApprenantsAjoutables>();
    expect(ajoutables.map((a) => a.prenom)).toEqual(['nina']);
    // Son scan est refusé : il n'est pas attendu.
    expect((await scanner(seances.enCours, 'nina')).statusCode).toBe(403);

    const ajout = await marquer(seances.enCours, 'nina', {
      statut: 'present',
      minutesRetard: null,
    });
    expect(ajout.statusCode).toBe(200);
    const appel = ajout.json<AppelEnDirect>();
    expect(ligne(appel, 'nina')).toMatchObject({ statut: 'present', nonAttendu: true });
    expect(appel.attendus).toBe(3);
    const trace = await derniereTrace('presence.ajouter-non-attendu');
    expect(trace?.apres).toMatchObject({ personneId: fiches.nina, nonAttendu: true });
    expect(trace?.avant).toMatchObject({ statut: null });
    // Une fois ajoutée, elle n'est plus proposée ; un apprenant d'une autre promotion est refusé.
    expect(
      (
        await appeler('GET', `/api/seances/${seances.enCours}/appel/ajoutables`, cookies.iris ?? '')
      ).json<ApprenantsAjoutables>(),
    ).toEqual([]);
    expect(
      (await marquer(seances.enCours, 'eli', { statut: 'present', minutesRetard: null }))
        .statusCode,
    ).toBe(404);
  });
});

describe('RG-06-13 validation de l’appel', () => {
  it('RG-06-13 valide l’appel avec horodatage, adresse IP, appareil haché et empreinte', async () => {
    const avant = Date.now();
    const reponse = await valider(seances.enCours, cookies.iris, { commentaire: 'Salle changée' });
    expect(reponse.statusCode).toBe(200);
    const appel = reponse.json<AppelEnDirect>();
    expect(appel.etat).toBe('valide');
    expect(appel.validation).toMatchObject({ version: 1, validePar: 'iris Fictif', motif: null });
    expect(appel.validation?.empreinte).toMatch(/^[0-9a-f]{64}$/);

    const [ecrite] = await owner.db
      .select()
      .from(appelValidation)
      .where(eq(appelValidation.seanceId, seances.enCours));
    expect(ecrite).toMatchObject({
      version: 1,
      validePar: fiches.iris,
      commentaire: 'Salle changée',
      appareil: createHash('sha256').update(UA).digest('hex'),
    });
    expect(ecrite?.adresseIp).toBeTruthy();
    expect(ecrite?.valideLe.getTime()).toBeGreaterThanOrEqual(avant - 1000);
    // Lou et Zoé en attente, Max retiré, Nina ajoutée présente.
    expect(ecrite?.liste.map((l) => l.statut).sort()).toEqual([
      'absent',
      'en-attente',
      'en-attente',
      'present',
    ]);
    expect(JSON.stringify(ecrite?.liste)).not.toContain('Fictif');
    // RGPD-03 : le résultat de localisation, effacé à deux mois, n'entre pas dans la version signée.
    expect(JSON.stringify(ecrite?.liste)).not.toContain('hors-site');
    expect(ecrite?.liste.find((l) => l.personneId === fiches.max)).toMatchObject({
      statut: 'absent',
      decision: 'retire',
      localisation: null,
    });
    const trace = await derniereTrace('appel.valider');
    expect(trace?.apres).toMatchObject({
      seanceId: seances.enCours,
      version: 1,
      empreinte: ecrite?.empreinte,
    });

    // L'état part dans le cache de la séance : le scan le lit sans requête SQL.
    const enCache = await app
      .get<Redis>(VALKEY)
      .hget(CLES_EMARGEMENT.seance(seances.enCours), 'validation');
    expect(JSON.parse(enCache ?? '{}')).toMatchObject({ version: 1 });
    expect((await feuille(seances.enCours)).etat).toBe('valide');
  });

  it('RG-06-13 refuse un scan sur un appel validé, et une seconde validation', async () => {
    const scan = await scanner(seances.enCours, 'zoe');
    expect(scan.statusCode).toBe(409);
    expect(scan.json<{ message: string }>().message).toContain('validé');
    expect((await valider(seances.enCours)).statusCode).toBe(409);
  });

  it('RG-06-15 une correction exige un motif et crée une nouvelle version ; l’ancienne reste consultable', async () => {
    const sansMotif = await marquer(seances.enCours, 'zoe', {
      statut: 'present',
      minutesRetard: null,
    });
    expect(sansMotif.statusCode).toBe(400);
    expect(JSON.stringify(sansMotif.json())).toContain('motif');

    const correction = await marquer(seances.enCours, 'zoe', {
      statut: 'present',
      minutesRetard: null,
      motif: 'Présente sans téléphone',
    });
    expect(correction.statusCode).toBe(200);
    const appel = correction.json<AppelEnDirect>();
    expect(appel.validation).toMatchObject({ version: 2, motif: 'Présente sans téléphone' });

    const courante = await feuille(seances.enCours);
    expect(courante.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(courante.versions[0]?.empreinte).not.toBe(courante.versions[1]?.empreinte);
    const v1 = await feuille(seances.enCours, 1);
    expect(v1.version).toBe(1);
    expect(ligne(v1, 'zoe')?.statut).toBe('en-attente');
    expect(ligne(v1, 'nina')).toMatchObject({ prenom: 'nina', nonAttendu: true });
    expect(ligne(await feuille(seances.enCours, 2), 'zoe')?.statut).toBe('present');
    const trace = await derniereTrace('appel.corriger');
    expect(trace?.avant).toMatchObject({ version: 1 });
    expect(trace?.apres).toMatchObject({ version: 2, motif: 'Présente sans téléphone' });
  });

  it('RG-06-15 après J+2, seule la scolarité corrige', async () => {
    // Appel validé à temps (version insérée directement), corrigé 3 jours après la séance.
    await owner.db.insert(appelValidation).values({
      organisationId: ecole,
      seanceId: seances.avant3Jours,
      version: 1,
      validePar: fiches.iris ?? '',
      valideLe: new Date(Date.now() - 3 * J),
      adresseIp: '192.0.2.1',
      appareil: 'a'.repeat(64),
      empreinte: 'b'.repeat(64),
      liste: [],
    });
    const corps = { statut: 'absent', minutesRetard: null, motif: 'Départ signalé' };
    const refus = await marquer(seances.avant3Jours, 'lou', corps);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toContain('scolarité');
    const parScolarite = await marquer(seances.avant3Jours, 'lou', corps, cookies.sacha);
    expect(parScolarite.statusCode).toBe(200);
    expect(parScolarite.json<AppelEnDirect>().validation).toMatchObject({
      version: 2,
      validePar: 'sacha Fictif',
    });
  });
});

describe('RG-06-15 correction d’un appel verrouillé (droit spécifique)', () => {
  const versionSignee = (seanceId: string, depuisJours: number) =>
    owner.db.insert(appelValidation).values({
      organisationId: ecole,
      seanceId,
      version: 1,
      validePar: fiches.iris ?? '',
      valideLe: new Date(Date.now() - depuisJours * J),
      adresseIp: '192.0.2.1',
      appareil: 'a'.repeat(64),
      empreinte: 'c'.repeat(64),
      liste: [],
    });
  const corrections = (cookie: string) =>
    appeler('GET', '/api/emargement/corrections-verrouillees', cookie);
  const evenements = async (seanceId: string) =>
    (
      await owner.db
        .select()
        .from(outboxEvenement)
        .where(eq(outboxEvenement.type, EVENEMENT_CORRECTION_VERROUILLEE))
    ).filter((e) => (e.charge as { seanceId: string }).seanceId === seanceId);

  beforeAll(async () => {
    await versionSignee(seances.avant10Jours, 10);
    await versionSignee(seances.avant20Jours, 20);
  });

  it('RG-06-15 sans le droit spécifique, un appel verrouillé ne se corrige pas', async () => {
    const corps = { statut: 'absent', minutesRetard: null, motif: 'Départ signalé' };
    const refus = await marquer(seances.avant10Jours, 'lou', corps, cookies.remi);
    expect(refus.statusCode).toBe(400);
    expect(JSON.stringify(refus.json())).toContain('verrouillé');
    const direct = await appeler(
      'GET',
      `/api/seances/${seances.avant10Jours}/appel/feuille`,
      cookies.remi ?? '',
    );
    expect(direct.json<FeuilleAppel>()).toMatchObject({
      etat: 'verrouille',
      correctionVerrouillee: false,
    });
    expect((await corrections(cookies.remi ?? '')).statusCode).toBe(403);
  });

  it('RG-06-15 correction par un intervenant tracée : motif, version signée, action dédiée, signalement', async () => {
    expect((await feuille(seances.avant10Jours)).correctionVerrouillee).toBe(true);
    const sansMotif = await marquer(seances.avant10Jours, 'lou', {
      statut: 'absent',
      minutesRetard: null,
    });
    expect(sansMotif.statusCode).toBe(400);
    const corps = { statut: 'absent', minutesRetard: null, motif: 'Feuille papier retrouvée' };
    const reponse = await marquer(seances.avant10Jours, 'lou', corps);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<AppelEnDirect>().validation).toMatchObject({
      version: 2,
      validePar: 'iris Fictif',
      motif: 'Feuille papier retrouvée',
      correctionVerrouillee: 'intervenant',
    });
    const trace = await derniereTrace('appel.corriger-verrouille-intervenant');
    expect(trace?.auteurId).toBeTruthy();
    expect(trace?.avant).toMatchObject({ seanceId: seances.avant10Jours, version: 1 });
    expect(trace?.apres).toMatchObject({
      version: 2,
      motif: 'Feuille papier retrouvée',
      correctionVerrouillee: 'intervenant',
    });
    const marquage = await derniereTrace('presence.marquer');
    expect(marquage?.apres).toMatchObject({
      personneId: fiches.lou,
      statut: 'absent',
      correctionVerrouillee: 'intervenant',
    });
    // Signalement : un événement pour l'email de la scolarité et de la pédagogie…
    expect(await evenements(seances.avant10Jours)).toHaveLength(1);
    // … la liste des corrections des intervenants, et l'historique des versions.
    const liste = await corrections(cookies.sacha ?? '');
    expect(liste.statusCode).toBe(200);
    expect(liste.json<CorrectionVerrouillee[]>()).toContainEqual(
      expect.objectContaining({
        seanceId: seances.avant10Jours,
        version: 2,
        corrigeePar: 'iris Fictif',
        motif: 'Feuille papier retrouvée',
      }),
    );
    const parScolarite = await appeler(
      'GET',
      `/api/seances/${seances.avant10Jours}/appel/feuille`,
      cookies.sacha ?? '',
    );
    expect(parScolarite.json<FeuilleAppel>().versions.map((v) => v.correctionVerrouillee)).toEqual([
      null,
      'intervenant',
    ]);
    expect((await corrections(cookies.iris ?? '')).statusCode).toBe(403);
  });

  it('RG-06-15 l’intervenant ne corrige plus au-delà du délai de son école, réglable', async () => {
    const corps = { statut: 'present', minutesRetard: null, motif: 'Erreur de saisie' };
    const refus = await marquer(seances.avant20Jours, 'lou', corps);
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toContain('délai');
    expect((await feuille(seances.avant20Jours)).correctionVerrouillee).toBe(false);
    // Délai réglé à 7 jours par l'école : plus rien après le verrouillage.
    await owner.db
      .update(organisation)
      .set({ emargementCorrectionVerrouilleeJours: 7 })
      .where(eq(organisation.id, ecole));
    expect((await marquer(seances.avant10Jours, 'lou', corps)).statusCode).toBe(409);
    await owner.db
      .update(organisation)
      .set({ emargementCorrectionVerrouilleeJours: 30 })
      .where(eq(organisation.id, ecole));
    expect((await marquer(seances.avant20Jours, 'max', corps)).statusCode).toBe(200);
    await owner.db
      .update(organisation)
      .set({ emargementCorrectionVerrouilleeJours: null })
      .where(eq(organisation.id, ecole));
  });

  it('RG-06-15 correction par le corps pédagogique, sans limite de délai, tracée', async () => {
    const corps = { statut: 'retard', minutesRetard: 15, motif: 'Retard signalé par le tuteur' };
    const reponse = await marquer(seances.avant20Jours, 'zoe', corps, cookies.paul);
    expect(reponse.statusCode).toBe(200);
    const validation = reponse.json<AppelEnDirect>().validation;
    expect(validation).toMatchObject({
      validePar: 'paul Fictif',
      correctionVerrouillee: 'ecole',
    });
    const trace = await derniereTrace('appel.corriger-verrouille');
    expect(trace?.apres).toMatchObject({
      version: validation?.version,
      motif: 'Retard signalé par le tuteur',
      correctionVerrouillee: 'ecole',
    });
    // Seules les corrections des intervenants sont signalées.
    expect(await evenements(seances.avant20Jours)).toHaveLength(1);
    const parScolarite = await marquer(seances.avant20Jours, 'zoe', corps, cookies.sacha);
    expect(parScolarite.statusCode).toBe(200);
    // Un appel verrouillé ne se valide toujours pas une seconde fois.
    expect((await valider(seances.avant20Jours, cookies.paul)).statusCode).toBe(409);
  });
});
