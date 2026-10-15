import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  EVENEMENT_DECISION_JUSTIFICATIF,
  ROLES_PAR_DEFAUT,
  type FileJustificatifs,
  type Justificatif,
  type JustificatifATraiter,
  type LienDocument,
  type MesAbsences,
} from '@scolaly/contracts';
import {
  absence,
  attribution,
  auditEvenement,
  createDatabase,
  initialiserRolesParDefaut,
  inscrireManquants,
  justificatif,
  newId,
  organisation,
  outboxEvenement,
  personne,
  promotionTechnique,
  role,
  seance,
} from '@scolaly/db';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des justificatifs';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const fiches: Record<string, string> = {};
const cookies: Record<string, string> = {};
const promotions: Record<string, string> = {};
/** Absences de Lou : hier matin (hors délai de 48 h ? non), il y a 5 jours (hors délai). */
const absences: Record<string, string> = {};
const PRECISION = 'Précision fictive à ne jamais journaliser';
const PDF = Buffer.from('%PDF-1.4\n% justificatif fictif\n%%EOF\n');

async function compte(
  nom: string,
  code: string,
  perimetre: { type: 'soi' | 'organisation' | 'promotion'; id?: string } = { type: 'soi' },
) {
  const email = `${nom}.justificatifs@exemple.test`;
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

const appeler = (
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  nom: string,
  payload?: unknown,
  type?: string,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: cookies[nom] ?? '',
      origin: WEB_ORIGIN,
      ...(type ? { 'content-type': type } : {}),
    },
    ...(payload !== undefined ? { payload: payload as string } : {}),
  });

async function creerAbsence(nom: string, joursAvant: number, libelle: string) {
  const fin = new Date(Date.now() - joursAvant * 24 * 3600_000);
  const [s] = await owner.db
    .insert(seance)
    .values({
      organisationId: ecole,
      libelle,
      debut: new Date(fin.getTime() - 3 * 3600_000),
      fin,
    })
    .returning();
  const [a] = await owner.db
    .insert(absence)
    .values({
      organisationId: ecole,
      seanceId: s?.id ?? '',
      personneId: fiches[nom] ?? '',
      nature: 'absence',
      minutes: 180,
      jour: fin.toISOString().slice(0, 10),
      matin: true,
      apresMidi: false,
      versionAppel: 1,
    })
    .returning();
  return a?.id ?? '';
}

const file = async (nom: string, filtre = '') => {
  const reponse = await appeler('GET', `/api/justificatifs${filtre}`, nom);
  expect(reponse.statusCode, reponse.body).toBe(200);
  return reponse.json<FileJustificatifs>();
};
const miennes = async (nom: string) => {
  const reponse = await appeler('GET', '/api/moi/absences', nom);
  expect(reponse.statusCode).toBe(200);
  return reponse.json<MesAbsences>();
};
const decider = (id: string, nom: string, corps: unknown) =>
  appeler('POST', `/api/justificatifs/${id}/decision`, nom, corps);

let premier: Justificatif;

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des justificatifs', nomAffichage: 'EJU' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  promotions.a = await promotionTechnique(owner.db, ecole, 'Promotion A');
  promotions.b = await promotionTechnique(owner.db, ecole, 'Promotion B');
  await compte('sacha', 'scolarite', { type: 'organisation' });
  await compte('paul', 'responsable-pedagogique', { type: 'promotion', id: promotions.b });
  await compte('rose', 'responsable-pedagogique', { type: 'promotion', id: promotions.a });
  await compte('iris', 'intervenant');
  await compte('theo', 'tuteur');
  await compte('admin', 'administrateur', { type: 'organisation' });
  for (const nom of ['lou', 'max']) await compte(nom, 'apprenant');
  await inscrireManquants(owner.db, ecole, promotions.a, [fiches.lou ?? '', fiches.max ?? '']);
  absences.hier = await creerAbsence('lou', 1, 'Algorithmique');
  absences.ancienne = await creerAbsence('lou', 5, 'Réseaux');
  absences.troisieme = await creerAbsence('lou', 1, 'Anglais');
  absences.max = await creerAbsence('max', 1, 'Algorithmique');
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('I4.4 justificatifs d’absence (US-06-07, US-06-08)', () => {
  it('US-06-07 l’apprenant dépose un justificatif pour deux absences, signalé hors délai', async () => {
    const reponse = await appeler('POST', '/api/moi/justificatifs', 'lou', {
      absenceIds: [absences.hier, absences.ancienne],
      motif: 'maladie',
      precision: PRECISION,
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    premier = reponse.json<Justificatif>();
    expect(premier).toMatchObject({
      motif: 'maladie',
      statut: 'a-traiter',
      horsDelai: true,
      document: false,
      precision: PRECISION,
    });
    expect(premier.absences.map((a) => a.libelle)).toEqual(['Réseaux', 'Algorithmique']);
    // RG-06-20 : précision chiffrée en base, jamais au journal d'audit.
    const [ligne] = await owner.db
      .select()
      .from(justificatif)
      .where(eq(justificatif.id, premier.id));
    expect(ligne?.precisionChiffre).toMatch(/^v\d+\./);
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, premier.id));
    expect(traces.map((t) => t.action)).toEqual(['justificatif.deposer']);
    expect(JSON.stringify(traces)).not.toContain('Précision fictive');

    // Absence d'hier seule : dans le délai de 48 h.
    const dansLeDelai = await appeler('POST', '/api/moi/justificatifs', 'lou', {
      absenceIds: [absences.troisieme],
      motif: 'transport',
    });
    expect(dansLeDelai.json<Justificatif>()).toMatchObject({ horsDelai: false, precision: null });
  });

  it('RG-06-19 refuse une absence d’un autre apprenant ou déjà en cours de justification', async () => {
    const autre = await appeler('POST', '/api/moi/justificatifs', 'lou', {
      absenceIds: [absences.max],
      motif: 'transport',
    });
    expect(autre.statusCode).toBe(400);
    const doublon = await appeler('POST', '/api/moi/justificatifs', 'lou', {
      absenceIds: [absences.hier],
      motif: 'autre',
    });
    expect(doublon.statusCode).toBe(409);
    const motif = await appeler('POST', '/api/moi/justificatifs', 'max', {
      absenceIds: [absences.max],
      motif: 'diagnostic',
    });
    expect(motif.statusCode).toBe(400);
  });

  it('RG-06-19 joint une photo ou un PDF, contrôlé par son contenu', async () => {
    const url = `/api/moi/justificatifs/${premier.id}/document`;
    const faux = await appeler('PUT', url, 'lou', Buffer.from('pas un PDF'), 'application/pdf');
    expect(faux.statusCode).toBe(400);
    expect(faux.json<{ details: string[] }>().details[0]).toMatch(/^document : /);
    const pasLeSien = await appeler('PUT', url, 'max', PDF, 'application/pdf');
    expect(pasLeSien.statusCode).toBe(404);
    const depot = await appeler('PUT', url, 'lou', PDF, 'application/pdf');
    expect(depot.statusCode, depot.body).toBe(200);
    expect(depot.json<Justificatif>().document).toBe(true);
  });

  it('US-06-08 la file ne montre que le périmètre ; intervenant, tuteur et admin n’y accèdent pas', async () => {
    const parSacha = await file('sacha');
    const vu = parSacha.justificatifs.find((j) => j.id === premier.id);
    expect(vu).toMatchObject({
      prenom: 'lou',
      promotion: 'Promotion A',
      precision: PRECISION,
      deposeParEcole: false,
      document: true,
    });
    expect((await file('rose')).justificatifs.map((j) => j.id)).toContain(premier.id);
    expect((await file('paul')).justificatifs).toHaveLength(0);
    for (const nom of ['iris', 'theo', 'admin', 'lou']) {
      expect((await appeler('GET', '/api/justificatifs', nom)).statusCode).toBe(403);
      expect(
        (await appeler('GET', `/api/justificatifs/${premier.id}/document`, nom)).statusCode,
      ).toBe(403);
    }
    expect(
      (await appeler('GET', `/api/justificatifs/${premier.id}/document`, 'paul')).statusCode,
    ).toBe(404);
  });

  it('RG-06-20 la scolarité télécharge le document par l’API, tracé sans nom de fichier', async () => {
    const lien = (
      await appeler('GET', `/api/justificatifs/${premier.id}/document`, 'sacha')
    ).json<LienDocument>();
    expect(lien.url).toMatch(/^\/api\/fichiers\/telechargement\?jeton=/);
    const fichier = await app.inject({
      method: 'GET',
      url: lien.url,
      headers: { cookie: cookies.sacha ?? '' },
    });
    expect(fichier.statusCode).toBe(200);
    expect(fichier.rawPayload.equals(PDF)).toBe(true);
    expect(fichier.headers['content-disposition']).not.toMatch(/lou|maladie/i);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.action, 'telechargement.fichier'),
          eq(auditEvenement.objetId, premier.id),
        ),
      );
    expect(trace).toMatchObject({ objetType: 'justificatif' });
  });

  it('RG-06-21 demande un complément avec un message, puis l’apprenant complète', async () => {
    expect((await decider(premier.id, 'sacha', { decision: 'completer' })).statusCode).toBe(400);
    const demande = await decider(premier.id, 'sacha', {
      decision: 'completer',
      message: 'Joignez la page 2.',
    });
    expect(demande.statusCode, demande.body).toBe(201);
    expect(demande.json<JustificatifATraiter>().statut).toBe('complement-demande');
    const vu = (await miennes('lou')).justificatifs.find((j) => j.id === premier.id);
    expect(vu).toMatchObject({ statut: 'complement-demande', message: 'Joignez la page 2.' });
    const complete = await appeler(
      'PUT',
      `/api/moi/justificatifs/${premier.id}/document`,
      'lou',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      'image/jpeg',
    );
    expect(complete.statusCode, complete.body).toBe(200);
    expect(complete.json<Justificatif>().statut).toBe('a-traiter');
  });

  it('RG-06-21 l’acceptation justifie les absences sans toucher à la feuille, puis l’apprenant est averti', async () => {
    const avant = await miennes('lou');
    expect(avant.decompte.demiJourneesNonJustifiees).toBe(2);
    const accepte = await decider(premier.id, 'rose', { decision: 'accepter' });
    expect(accepte.statusCode, accepte.body).toBe(201);
    expect(accepte.json<JustificatifATraiter>()).toMatchObject({ statut: 'accepte' });
    const apres = await miennes('lou');
    expect(apres.absences.find((a) => a.id === absences.hier)).toMatchObject({
      statut: 'justifiee',
      justificatif: { id: premier.id, statut: 'accepte' },
    });
    expect(apres.decompte.demiJourneesNonJustifiees).toBe(1);
    expect(apres.delaiHeures).toBe(48);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.action, 'justificatif.accepter'),
          eq(auditEvenement.objetId, premier.id),
        ),
      );
    expect(trace?.avant).toMatchObject({ statut: 'a-traiter' });
    expect(trace?.apres).toMatchObject({ statut: 'accepte' });
    const evenements = await owner.db
      .select()
      .from(outboxEvenement)
      .where(
        and(
          eq(outboxEvenement.organisationId, ecole),
          eq(outboxEvenement.type, EVENEMENT_DECISION_JUSTIFICATIF),
        ),
      );
    expect(evenements).toHaveLength(2);
    expect(JSON.stringify(evenements)).not.toMatch(/page 2|maladie/);
    // Déjà décidé.
    expect(
      (await decider(premier.id, 'sacha', { decision: 'refuser', message: 'Non' })).statusCode,
    ).toBe(409);
  });

  it('RG-06-21 un refus garde l’absence non justifiée et permet un nouveau dépôt', async () => {
    const second = (await miennes('lou')).justificatifs.find((j) => j.motif === 'transport');
    const refus = await decider(second?.id ?? '', 'sacha', {
      decision: 'refuser',
      message: 'Billet illisible.',
    });
    expect(refus.statusCode).toBe(201);
    const lou = await miennes('lou');
    expect(lou.absences.find((a) => a.id === absences.troisieme)).toMatchObject({
      statut: 'non-justifiee',
      justificatif: { statut: 'refuse' },
    });
    const nouveau = await appeler('POST', '/api/moi/justificatifs', 'lou', {
      absenceIds: [absences.troisieme],
      motif: 'transport',
    });
    expect(nouveau.statusCode).toBe(201);
  });

  it('la scolarité dépose pour un apprenant de son périmètre, la pédagogie non', async () => {
    const corps = { personneId: fiches.max, absenceIds: [absences.max], motif: 'convocation' };
    expect((await appeler('POST', '/api/justificatifs', 'rose', corps)).statusCode).toBe(403);
    const depot = await appeler('POST', '/api/justificatifs', 'sacha', corps);
    expect(depot.statusCode, depot.body).toBe(201);
    const id = depot.json<Justificatif>().id;
    const doc = await appeler(
      'PUT',
      `/api/justificatifs/${id}/document`,
      'sacha',
      PDF,
      'application/pdf',
    );
    expect(doc.statusCode).toBe(200);
    const vu = (await file('sacha', '?motif=convocation')).justificatifs;
    expect(vu).toHaveLength(1);
    expect(vu[0]).toMatchObject({ prenom: 'max', deposeParEcole: true });
    const documents = await owner.db
      .select()
      .from(auditEvenement)
      .where(like(auditEvenement.action, 'justificatif.%'));
    expect(JSON.stringify(documents)).not.toMatch(/organisations\/|Précision fictive|page 2/);
  });
});
