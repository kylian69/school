import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type FluxIcal } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  fluxIcal,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
  salle,
  seance,
  seanceAttendu,
  seanceIntervenant,
} from '@scolaly/db';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { masquerJetonsUrl } from '../src/app.js';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { freshIp, signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests du flux iCal';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
const JOUR = 86_400_000;
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
const logs: string[] = [];

interface Compte {
  cookie: string;
  personneId: string;
}
let apprenant: Compte;
let intervenant: Compte;
const seances: Record<string, string> = {};

async function compte(code: string, prenom: string, nom: string): Promise<Compte> {
  const email = `${code}.${newId()}@flux.test`;
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId: ecole, nom, prenom, email, userId, compteEtat: 'actif' })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: code === 'intervenant' ? 'soi' : 'organisation',
    debut: '2026-01-01',
  });
  return { cookie: await signInCookie(app, email, PASSWORD), personneId: fiche?.id ?? '' };
}

const moi = (method: 'GET' | 'POST' | 'DELETE', cookie: string) =>
  app.inject({ method, url: '/api/moi/agenda', headers: { cookie, origin: WEB_ORIGIN } });

const lire = (url: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'GET',
    url: new URL(url).pathname,
    headers: { 'x-forwarded-for': freshIp(), ...headers },
  });

async function activer(c: Compte): Promise<string> {
  const reponse = await moi('POST', c.cookie);
  expect(reponse.statusCode).toBe(201);
  return reponse.json<FluxIcal>().url ?? '';
}

/** Lignes dépliées (RFC 5545, 3.1). */
const lignes = (texte: string) => texte.replace(/\r\n /g, '').split('\r\n');

async function creerSeance(
  cle: string,
  valeurs: Partial<typeof seance.$inferInsert> & { debut: Date },
  liens: { attendu?: string; intervenant?: string },
) {
  const [s] = await owner.db
    .insert(seance)
    .values({
      organisationId: ecole,
      libelle: `Séance ${cle}`,
      fin: new Date(valeurs.debut.getTime() + 2 * 3_600_000),
      ...valeurs,
    })
    .returning();
  const id = s?.id ?? '';
  seances[cle] = id;
  if (liens.attendu)
    await owner.db
      .insert(seanceAttendu)
      .values({ organisationId: ecole, seanceId: id, personneId: liens.attendu });
  if (liens.intervenant)
    await owner.db
      .insert(seanceIntervenant)
      .values({ organisationId: ecole, seanceId: id, personneId: liens.intervenant });
}

beforeAll(async () => {
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  app = await startApp({ LOG_LEVEL: 'info' }, { logStream });
  for (const [id, nom] of [
    [ecole, 'École du flux iCal'],
    [autreEcole, 'Autre école du flux iCal'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus du flux', fuseauHoraire: 'Europe/Paris' })
    .returning();
  const [amphi] = await owner.db
    .insert(salle)
    .values({ organisationId: ecole, etablissementId: campus?.id ?? '', nom: 'Amphi Lumière' })
    .returning();
  apprenant = await compte('apprenant', 'Alix', 'Apprenante');
  intervenant = await compte('intervenant', 'Basile', 'Intervenantnom');
  const demain = new Date(Math.floor(Date.now() / JOUR) * JOUR + JOUR + 8 * 3_600_000);
  const lies = { attendu: apprenant.personneId, intervenant: intervenant.personneId };
  await creerSeance('publiee', { debut: demain, salleId: amphi?.id ?? null }, lies);
  await creerSeance(
    'distance',
    { debut: new Date(demain.getTime() + JOUR), distanciel: true },
    lies,
  );
  await creerSeance('brouillon', { debut: demain, statut: 'brouillon' }, lies);
  await creerSeance(
    'annulee',
    { debut: demain, statut: 'annulee', motifAnnulation: 'Absence', modifieeLe: new Date() },
    lies,
  );
  // Brouillon annulé : jamais publié, il n'apparaît pas.
  await creerSeance(
    'brouillon-annule',
    { debut: demain, statut: 'annulee', motifAnnulation: 'Erreur' },
    lies,
  );
  await creerSeance('lointaine', { debut: new Date(Date.now() + 400 * JOUR) }, lies);
  await creerSeance('passee', { debut: new Date(Date.now() - 10 * JOUR) }, lies);
  await creerSeance('ancienne', { debut: new Date(Date.now() - 60 * JOUR) }, lies);
  await creerSeance('supprimee', { debut: demain, deletedAt: new Date() }, lies);
  await creerSeance('intervenant-seul', { debut: demain }, { intervenant: intervenant.personneId });
  await creerSeance('autre-public', { debut: demain }, {});
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-04-15 flux iCal personnel', () => {
  it('RG-04-15 n’a pas de flux tant que la personne ne l’a pas activé', async () => {
    const reponse = await moi('GET', apprenant.cookie);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toEqual({
      actif: false,
      regenereLe: null,
      url: null,
      regenerationRequise: false,
    });
  });

  it('RG-04-15 donne une adresse secrète, stockée hachée et chiffrée, et trace l’activation', async () => {
    const url = await activer(apprenant);
    expect(url).toMatch(
      new RegExp(`^http://localhost:3001/api/agenda/${ecole}\\.[\\w-]{43}\\.ics$`),
    );
    const secret = url.split('.')[1] ?? '';
    const [ligne] = await owner.db
      .select()
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(ligne?.jetonEmpreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(ligne?.jetonEmpreinte).not.toContain(secret);
    // Chiffré par champ (AES-256-GCM, version de clé en tête), jamais en clair.
    expect(ligne?.jetonChiffre).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(ligne?.jetonChiffre).not.toContain(secret);
    expect(JSON.stringify(ligne)).not.toContain(secret);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.organisationId, ecole),
          eq(auditEvenement.action, 'flux-ical.activer'),
          eq(auditEvenement.objetId, apprenant.personneId),
        ),
      );
    expect(trace?.apres).toMatchObject({ actif: true });
    expect(JSON.stringify(trace)).not.toContain(secret);
    expect(JSON.stringify(trace)).not.toContain(ligne?.jetonChiffre ?? '-');
    expect(JSON.stringify(trace)).not.toContain(ligne?.jetonEmpreinte ?? '-');
  });

  it('US-04-09 réaffiche l’adresse à son propriétaire seulement, sans cache', async () => {
    const url = await activer(apprenant);
    const etat = await moi('GET', apprenant.cookie);
    expect(etat.headers['cache-control']).toBe('no-store');
    expect(etat.json<FluxIcal>()).toMatchObject({ actif: true, url, regenerationRequise: false });
    // Une autre personne de la même école ne voit que son propre flux.
    const autre = await moi('GET', intervenant.cookie);
    expect(JSON.stringify(autre.json())).not.toContain(url.split('.')[1] ?? '-');
  });

  it('US-04-09 demande de régénérer un flux créé avant le chiffrement', async () => {
    const url = await activer(apprenant);
    await owner.db
      .update(fluxIcal)
      .set({ jetonChiffre: null })
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    // L'adresse existante continue de fonctionner : seul le réaffichage est impossible.
    expect((await lire(url)).statusCode).toBe(200);
    expect((await moi('GET', apprenant.cookie)).json<FluxIcal>()).toMatchObject({
      actif: true,
      url: null,
      regenerationRequise: true,
    });
    const nouvelle = await activer(apprenant);
    expect((await moi('GET', apprenant.cookie)).json<FluxIcal>()).toMatchObject({
      url: nouvelle,
      regenerationRequise: false,
    });
  });

  it('US-04-09 ne réaffiche pas un jeton altéré, recopié ou périmé', async () => {
    const urlIntervenant = await activer(intervenant);
    await activer(apprenant);
    const [deLui] = await owner.db
      .select({ chiffre: fluxIcal.jetonChiffre, empreinte: fluxIcal.jetonEmpreinte })
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, intervenant.personneId));
    const etatApprenant = async () => (await moi('GET', apprenant.cookie)).json<FluxIcal>();

    // Valeur chiffrée d'une autre personne recopiée sur sa ligne : illisible (données associées).
    await owner.db
      .update(fluxIcal)
      .set({ jetonChiffre: deLui?.chiffre ?? null })
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(await etatApprenant()).toMatchObject({ url: null, regenerationRequise: true });
    expect(JSON.stringify(await etatApprenant())).not.toContain(urlIntervenant);

    // Valeur altérée.
    await owner.db
      .update(fluxIcal)
      .set({ jetonChiffre: 'v1.abc.def.ghi' })
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(await etatApprenant()).toMatchObject({ url: null, regenerationRequise: true });

    // Jeton chiffré qui ne correspond plus à l'empreinte.
    await activer(apprenant);
    await owner.db
      .update(fluxIcal)
      .set({ jetonEmpreinte: 'f'.repeat(64) })
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(await etatApprenant()).toMatchObject({ url: null, regenerationRequise: true });
    await activer(apprenant);
  });

  it('RG-04-15 publie les séances publiées et retirées de la personne, sans brouillon', async () => {
    const url = await activer(apprenant);
    const reponse = await lire(url);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(reponse.headers['cache-control']).toBe('private, max-age=300');
    const l = lignes(reponse.body);
    const uids = l.filter((x) => x.startsWith('UID:')).map((x) => x.slice(4, 40));
    expect(uids.sort()).toEqual(
      [seances.publiee, seances.distance, seances.annulee, seances.passee].sort(),
    );
    expect(l).toContain('LOCATION:Amphi Lumière');
    expect(l).toContain('LOCATION:À distance');
    expect(l).toContain('STATUS:CANCELLED');
    expect(l).toContain('SUMMARY:Annulé : Séance annulee');
    expect(l).toContain('TZID:Europe/Paris');
    expect(l).toContain('X-WR-CALNAME:Emploi du temps – École du flux iCal');
    // Contenu minimal : ni le nom de l'intervenant ni le motif d'annulation.
    expect(reponse.body).not.toContain('Intervenantnom');
    expect(reponse.body).not.toContain('Absence');
  });

  it('US-04-09 donne à l’intervenant les séances qu’il anime', async () => {
    const url = await activer(intervenant);
    const l = lignes((await lire(url)).body);
    expect(l).toContain(`UID:${seances['intervenant-seul']}@scolaly`);
    expect(l).not.toContain(`UID:${seances['autre-public']}@scolaly`);
  });

  it('RG-04-15 répond 304 quand le flux n’a pas changé, puis suit une modification', async () => {
    const url = await activer(apprenant);
    const premiere = await lire(url);
    const etag = String(premiere.headers.etag);
    expect((await lire(url, { 'if-none-match': etag })).statusCode).toBe(304);
    const modifieeLe = new Date();
    await owner.db
      .update(seance)
      .set({ libelle: 'Séance renommée', modifieeLe })
      .where(eq(seance.id, seances.publiee ?? ''));
    const apres = await lire(url, { 'if-none-match': etag });
    expect(apres.statusCode).toBe(200);
    expect(apres.headers.etag).not.toBe(etag);
    const l = lignes(apres.body);
    expect(l).toContain('SUMMARY:Séance renommée');
    expect(l.filter((x) => x.startsWith('SEQUENCE:') && x !== 'SEQUENCE:0').length).toBeGreaterThan(
      0,
    );
  });

  it('RG-04-15 invalide l’ancienne adresse à la régénération', async () => {
    const ancienne = await activer(apprenant);
    const nouvelle = await activer(apprenant);
    expect(nouvelle).not.toBe(ancienne);
    expect((await lire(ancienne)).statusCode).toBe(404);
    expect((await lire(nouvelle)).statusCode).toBe(200);
    const traces = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.organisationId, ecole),
          eq(auditEvenement.action, 'flux-ical.regenerer'),
        ),
      );
    expect(traces.length).toBeGreaterThan(0);
  });

  it('RG-04-15 révoque l’adresse et trace la révocation', async () => {
    const url = await activer(apprenant);
    const reponse = await moi('DELETE', apprenant.cookie);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toEqual({
      actif: false,
      regenereLe: null,
      url: null,
      regenerationRequise: false,
    });
    expect((await lire(url)).statusCode).toBe(404);
    const [ligne] = await owner.db
      .select()
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(ligne).toMatchObject({ jetonEmpreinte: null, jetonChiffre: null });
    expect((await moi('GET', apprenant.cookie)).json<FluxIcal>().actif).toBe(false);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.organisationId, ecole),
          eq(auditEvenement.action, 'flux-ical.revoquer'),
        ),
      );
    expect(trace?.avant).toMatchObject({ actif: true });
  });

  it('RG-04-15 cloisonne le flux à l’école du jeton', async () => {
    const url = await activer(apprenant);
    const chemin = new URL(url).pathname;
    const ailleurs = chemin.replace(ecole, autreEcole);
    expect((await lire(`http://x${ailleurs}`)).statusCode).toBe(404);
    expect((await lire(`http://x/api/agenda/pas-un-jeton.ics`)).statusCode).toBe(404);
    expect((await lire(`http://x/api/agenda/${ecole}.${'a'.repeat(43)}.ics`)).statusCode).toBe(404);
  });

  it('RG-04-15 limite le débit de lecture d’un même flux', async () => {
    const url = await activer(intervenant);
    const statuts: number[] = [];
    for (let i = 0; i < 31; i++) statuts.push((await lire(url)).statusCode);
    expect(statuts.slice(0, 29).every((s) => s === 200)).toBe(true);
    expect(statuts.at(-1)).toBe(429);
  });

  it('RG-04-15 n’écrit jamais l’adresse secrète dans les journaux', async () => {
    const url = await activer(apprenant);
    await lire(url);
    await moi('GET', apprenant.cookie);
    const secret = url.split('.')[1] ?? '';
    const [ligne] = await owner.db
      .select({ chiffre: fluxIcal.jetonChiffre })
      .from(fluxIcal)
      .where(eq(fluxIcal.personneId, apprenant.personneId));
    expect(logs.join('')).toContain('/api/agenda/[masqué]');
    expect(logs.join('')).not.toContain(secret);
    expect(logs.join('')).not.toContain(ligne?.chiffre ?? '-');
    expect(masquerJetonsUrl('/api/agenda/abc.def.ics?x=1')).toBe('/api/agenda/[masqué]?x=1');
    expect(masquerJetonsUrl('/api/moi/agenda')).toBe('/api/moi/agenda');
  });

  it('RG-04-15 coupe le flux d’une fiche supprimée ou d’une école fermée', async () => {
    const url = await activer(apprenant);
    await owner.db
      .update(organisation)
      .set({ acces: 'lecture_seule' })
      .where(eq(organisation.id, ecole));
    expect((await lire(url)).statusCode).toBe(200);
    expect((await moi('POST', apprenant.cookie)).statusCode).toBe(403);
    await owner.db.update(organisation).set({ acces: 'ferme' }).where(eq(organisation.id, ecole));
    expect((await lire(url)).statusCode).toBe(404);
    await owner.db.update(organisation).set({ acces: 'complet' }).where(eq(organisation.id, ecole));
    expect((await lire(url)).statusCode).toBe(200);
    await owner.db
      .update(personne)
      .set({ deletedAt: new Date() })
      .where(and(eq(personne.id, apprenant.personneId), like(personne.email, '%@flux.test')));
    expect((await lire(url)).statusCode).toBe(404);
  });
});
