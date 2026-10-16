import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
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
import { texteDuPdf } from '@scolaly/pdf';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des feuilles';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const FUSEAU = 'Europe/Paris';
const hier = jourLocal(new Date(Date.now() - 24 * 3600_000), FUSEAU);
const mois = hier.slice(0, 7);
const seanceA = newId();
const seanceB = newId();
const seanceNonValidee = newId();
const fiches: Record<string, string> = {};
const cookies: Record<string, string> = {};
const promotions: Record<string, string> = {};

async function compte(
  nom: string,
  code: string,
  perimetre: { type: 'soi' | 'organisation' | 'promotion'; id?: string } = { type: 'soi' },
) {
  const email = `${nom}.feuilles@exemple.test`;
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

const appeler = (method: 'GET' | 'POST' | 'PUT', url: string, nom: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie: cookies[nom] ?? '', origin: WEB_ORIGIN, 'user-agent': 'Navigateur fictif' },
    ...(payload ? { payload } : {}),
  });
const pdf = (url: string, nom: string) => appeler('GET', url, nom);
const texte = (reponse: { rawPayload: Buffer }) =>
  texteDuPdf(reponse.rawPayload).replace(/\s+/g, '');
const sansEspace = (s: string) => s.replace(/\s+/g, '');
const derniereTrace = async (action: string) => {
  const [trace] = await owner.db
    .select()
    .from(auditEvenement)
    .where(and(eq(auditEvenement.organisationId, ecole), eq(auditEvenement.action, action)))
    .orderBy(desc(auditEvenement.survenuLe))
    .limit(1);
  return trace;
};

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des feuilles', nomAffichage: 'École des feuilles' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({
      organisationId: ecole,
      nom: 'Campus fictif',
      fuseauHoraire: FUSEAU,
      nda: '11755555555',
    })
    .returning();
  const [laSalle] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Salle Hugo' })
    .returning();
  promotions.a = await promotionTechnique(owner.db, ecole, 'Promotion A');
  promotions.b = await promotionTechnique(owner.db, ecole, 'Promotion B');
  await compte('iris', 'intervenant');
  await compte('ugo', 'intervenant');
  await compte('sacha', 'scolarite', { type: 'organisation' });
  await compte('paul', 'responsable-pedagogique', { type: 'promotion', id: promotions.a });
  for (const nom of ['lou', 'max', 'eli']) await compte(nom, 'apprenant');
  await inscrireManquants(owner.db, ecole, promotions.a, [fiches.lou ?? '', fiches.max ?? '']);
  await inscrireManquants(owner.db, ecole, promotions.b, [fiches.eli ?? '']);
  const creneaux = [
    [seanceA, 'Algorithmique', '09:00', '12:00', promotions.a],
    [seanceB, 'Réseaux', '14:00', '17:00', promotions.b],
    [seanceNonValidee, 'Anglais', '17:00', '18:00', promotions.a],
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
  const marquer = (seanceId: string, nom: string, corps: unknown) =>
    appeler('PUT', `/api/seances/${seanceId}/appel/presences/${fiches[nom] ?? ''}`, 'iris', corps);
  await marquer(seanceA, 'lou', { statut: 'retard', minutesRetard: 20 });
  await marquer(seanceA, 'max', { statut: 'absent', minutesRetard: null });
  expect(
    (await appeler('POST', `/api/seances/${seanceA}/appel/validation`, 'iris', {})).statusCode,
  ).toBe(200);
  await marquer(seanceB, 'eli', { statut: 'present', minutesRetard: null });
  expect(
    (await appeler('POST', `/api/seances/${seanceB}/appel/validation`, 'iris', {})).statusCode,
  ).toBe(200);
  // Correction après validation : nouvelle version (RG-06-13).
  expect(
    (
      await marquer(seanceA, 'max', {
        statut: 'retard',
        minutesRetard: 30,
        motif: 'Arrivé pendant la pause',
      })
    ).statusCode,
  ).toBe(200);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-06-11 feuille d’émargement PDF d’une séance (RG-06-25)', () => {
  it('RG-06-25 la feuille porte en-tête, apprenants, validation, empreinte et historique ; le téléchargement est tracé', async () => {
    const reponse = await pdf(`/api/seances/${seanceA}/appel/feuille/pdf`, 'iris');
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('application/pdf');
    expect(reponse.headers['cache-control']).toBe('no-store');
    expect(reponse.headers['content-disposition']).toContain(
      `feuille-emargement-${hier}-algorithmique-v2.pdf`,
    );
    expect(reponse.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const contenu = texte(reponse);
    for (const attendu of [
      'École des feuilles · NDA 11755555555',
      'Campus fictif',
      'Promotion A',
      'Algorithmique',
      hier.split('-').reverse().join('/'),
      '09:00 – 12:00',
      'Salle Hugo',
      'Présentiel',
      'iris Fictif',
      'FICTIF lou',
      'Retard (20 min)',
      'FICTIF max',
      'Retard (30 min)',
      'Non justifiée',
      'Version 2',
      'Correction',
      'Arrivé pendant la pause',
    ])
      expect(contenu).toContain(sansEspace(attendu));
    // RGPD : ni adresse IP ni empreinte d'appareil sur la feuille.
    expect(contenu).not.toContain('127.0.0.1');
    const trace = await derniereTrace('telechargement.feuille-emargement');
    expect(trace).toMatchObject({ objetType: 'seance', objetId: seanceA });
    expect(trace?.apres).toEqual({ version: 2, sha256: reponse.headers['x-empreinte-sha256'] });
  });

  it('RG-06-13 l’ancienne version reste téléchargeable, signalée comme remplacée', async () => {
    const reponse = await pdf(`/api/seances/${seanceA}/appel/feuille/pdf?version=1`, 'iris');
    expect(reponse.statusCode).toBe(200);
    const contenu = texte(reponse);
    expect(contenu).toContain(sansEspace('Version remplacée par une correction'));
    expect(contenu).toContain(sansEspace('Absent'));
    expect(
      (await pdf(`/api/seances/${seanceA}/appel/feuille/pdf?version=9`, 'iris')).statusCode,
    ).toBe(404);
    expect(
      (await pdf(`/api/seances/${seanceA}/appel/feuille/pdf?version=x`, 'iris')).statusCode,
    ).toBe(400);
  });

  it('refuse une feuille d’appel non validé, et hors périmètre', async () => {
    const nonValidee = await pdf(`/api/seances/${seanceNonValidee}/appel/feuille/pdf`, 'iris');
    expect(nonValidee.statusCode).toBe(409);
    expect(nonValidee.json<{ message: string }>().message).toMatch(/pas encore validé/);
    // Un autre intervenant, la pédagogie d'une autre promotion, un apprenant.
    expect((await pdf(`/api/seances/${seanceA}/appel/feuille/pdf`, 'ugo')).statusCode).toBe(403);
    expect((await pdf(`/api/seances/${seanceA}/appel/feuille/pdf`, 'paul')).statusCode).toBe(200);
    expect((await pdf(`/api/seances/${seanceB}/appel/feuille/pdf`, 'paul')).statusCode).toBe(403);
    expect((await pdf(`/api/seances/${seanceA}/appel/feuille/pdf`, 'lou')).statusCode).toBe(403);
    expect((await pdf(`/api/seances/${seanceB}/appel/feuille/pdf`, 'sacha')).statusCode).toBe(200);
  });
});

describe('US-06-11 feuilles d’une promotion pour un mois (E-06-09, RG-06-26)', () => {
  it('par séance : les feuilles signées des appels validés de la promotion, tracées', async () => {
    const reponse = await pdf(
      `/api/assiduite/feuilles?promotionId=${promotions.a}&mois=${mois}&format=seances`,
      'sacha',
    );
    expect(reponse.statusCode).toBe(200);
    const contenu = texte(reponse);
    expect(contenu).toContain('Algorithmique');
    expect(contenu).not.toContain('Réseaux');
    expect(contenu).not.toContain('Anglais');
    const trace = await derniereTrace('telechargement.feuilles-emargement');
    expect(trace).toMatchObject({ objetType: 'promotion', objetId: promotions.a });
    expect(trace?.apres).toMatchObject({ mois, format: 'seances', documents: 1 });
  });

  it('RG-06-26 par apprenant : demi-journées, statut, heures prévues et réalisées', async () => {
    const reponse = await pdf(
      `/api/assiduite/feuilles?promotionId=${promotions.a}&mois=${mois}&format=apprenants`,
      'paul',
    );
    expect(reponse.statusCode).toBe(200);
    const contenu = texte(reponse);
    for (const attendu of [
      'Récapitulatif d’assiduité',
      'FICTIF lou',
      'FICTIF max',
      'Algorithmique (09:00 – 12:00)',
      'Retard',
      '2 h 40',
      'Anglais (17:00 – 18:00)',
      'Appel non validé',
    ])
      expect(contenu).toContain(sansEspace(attendu));
    const seul = await pdf(
      `/api/assiduite/feuilles?promotionId=${promotions.a}&mois=${mois}&format=apprenants&personneId=${fiches.lou ?? ''}`,
      'paul',
    );
    expect(texte(seul)).not.toContain('FICTIFmax');
  });

  it('refuse une promotion hors périmètre, un mois mal écrit, un intervenant', async () => {
    expect(
      (
        await pdf(
          `/api/assiduite/feuilles?promotionId=${promotions.b}&mois=${mois}&format=seances`,
          'paul',
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await pdf(
          `/api/assiduite/feuilles?promotionId=${promotions.a}&mois=2026-13&format=seances`,
          'sacha',
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await pdf(
          `/api/assiduite/feuilles?promotionId=${promotions.a}&mois=${mois}&format=seances`,
          'iris',
        )
      ).statusCode,
    ).toBe(404);
  });
});

describe('E-06-04 mon récapitulatif mensuel', () => {
  it('RG-06-26 l’apprenant télécharge son seul récapitulatif, tracé', async () => {
    const reponse = await pdf(`/api/moi/recapitulatif?mois=${mois}`, 'lou');
    expect(reponse.statusCode).toBe(200);
    const contenu = texte(reponse);
    expect(contenu).toContain('FICTIFlou');
    expect(contenu).not.toContain('FICTIFmax');
    expect(contenu).toContain(sansEspace('Algorithmique (09:00 – 12:00)'));
    const trace = await derniereTrace('telechargement.recapitulatif-assiduite');
    expect(trace).toMatchObject({ objetType: 'personne', objetId: fiches.lou });
    expect((await pdf('/api/moi/recapitulatif?mois=octobre', 'lou')).statusCode).toBe(400);
  });
});
