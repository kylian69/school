import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ROLES_PAR_DEFAUT, type MesDisponibilites, type SemaineEdt } from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  disponibiliteIntervenant,
  etablissement,
  indisponibiliteIntervenant,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des disponibilités';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const logs: string[] = [];
let campusId = '';

interface Compte {
  cookie: string;
  personneId: string;
}
let intervenant: Compte;
let autreIntervenant: Compte;
let scolarite: Compte;
let apprenant: Compte;

async function compte(code: string): Promise<Compte> {
  const email = `${code}.${newId()}@disponibilites.test`;
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
      prenom: 'Lou',
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
    perimetreType: code === 'intervenant' ? 'soi' : 'organisation',
    debut: '2026-01-01',
  });
  return { cookie: await signInCookie(app, email, PASSWORD), personneId: fiche?.id ?? '' };
}

const requete = (method: 'GET' | 'POST' | 'DELETE', url: string, c: Compte, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/moi/disponibilites${url}`,
    headers: { cookie: c.cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const audits = (action: string) =>
  owner.db
    .select()
    .from(auditEvenement)
    .where(and(eq(auditEvenement.organisationId, ecole), eq(auditEvenement.action, action)));

/** Jour AAAA-MM-JJ dans n jours (UTC). */
const dansJours = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Lundi de la semaine qui suit dans n semaines. */
function lundi(semaines: number): string {
  const d = new Date(`${dansJours(7 * semaines)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  app = await startApp({ LOG_LEVEL: 'info' }, { logStream });
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École des disponibilités', nomAffichage: 'EDD' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus des disponibilités' })
    .returning();
  campusId = campus?.id ?? '';
  intervenant = await compte('intervenant');
  autreIntervenant = await compte('intervenant');
  scolarite = await compte('scolarite');
  apprenant = await compte('apprenant');
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-04-10 créneaux récurrents de disponibilité', () => {
  it('RG-04-18 renvoie un cadre vide avec la plage de l’établissement', async () => {
    const reponse = await requete('GET', '', intervenant);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['cache-control']).toBe('no-store');
    expect(reponse.json<MesDisponibilites>()).toEqual({
      fuseau: 'Europe/Paris',
      plage: { debut: '08:00', fin: '19:00', limiteMidi: '13:00', joursOuvres: [1, 2, 3, 4, 5] },
      creneaux: [],
      indisponibilites: [],
    });
  });

  it('RG-04-18 déclare un créneau, tracé en audit', async () => {
    const reponse = await requete('POST', '/creneaux', intervenant, {
      jourSemaine: 1,
      heureDebut: '08:00',
      heureFin: '12:00',
    });
    expect(reponse.statusCode).toBe(201);
    const { creneaux } = reponse.json<MesDisponibilites>();
    expect(creneaux).toEqual([
      expect.objectContaining({
        jourSemaine: 1,
        heureDebut: '08:00',
        heureFin: '12:00',
        valableDu: null,
        valableAu: null,
      }),
    ]);
    const [trace] = await audits('disponibilite.ajouter');
    expect(trace).toMatchObject({
      objetId: intervenant.personneId,
      avant: null,
      apres: { creneauId: creneaux[0]?.id, jourSemaine: 1, heureDebut: '08:00' },
    });
  });

  it.each([
    [{ jourSemaine: 1, heureDebut: '11:00', heureFin: '14:00' }, 'chevauche'],
    [{ jourSemaine: 6, heureDebut: '09:00', heureFin: '12:00' }, 'pas ouvré'],
    [{ jourSemaine: 2, heureDebut: '07:00', heureFin: '12:00' }, 'heures de cours'],
    [{ jourSemaine: 2, heureDebut: '12:00', heureFin: '10:00' }, 'doit suivre'],
    [
      {
        jourSemaine: 2,
        heureDebut: '08:00',
        heureFin: '10:00',
        valableDu: '2027-02-01',
        valableAu: '2027-01-01',
      },
      'fin de validité',
    ],
  ])('RG-04-18 refuse un créneau invalide (%o)', async (saisie, attendu) => {
    const reponse = await requete('POST', '/creneaux', intervenant, saisie);
    expect(reponse.statusCode).toBe(400);
    expect(JSON.stringify(reponse.json())).toContain(attendu);
  });

  it('RG-04-18 refuse une heure hors du quart d’heure', async () => {
    const reponse = await requete('POST', '/creneaux', intervenant, {
      jourSemaine: 2,
      heureDebut: '08:10',
      heureFin: '10:00',
    });
    expect(reponse.statusCode).toBe(400);
  });

  it('RG-04-18 accepte le même créneau sur des périodes de validité distinctes', async () => {
    const creneau = { jourSemaine: 4, heureDebut: '10:00', heureFin: '14:00' };
    const avant = await requete('POST', '/creneaux', intervenant, {
      ...creneau,
      valableAu: '2098-12-31',
    });
    expect(avant.statusCode).toBe(201);
    const apres = await requete('POST', '/creneaux', intervenant, {
      ...creneau,
      valableDu: '2099-01-01',
      valableAu: '2099-06-30',
    });
    expect(apres.statusCode).toBe(201);
    expect(apres.json<MesDisponibilites>().creneaux).toHaveLength(3);
    const chevauche = await requete('POST', '/creneaux', intervenant, {
      ...creneau,
      valableDu: '2098-12-31',
    });
    expect(chevauche.statusCode).toBe(400);
  });

  it('RG-04-18 retire un créneau, tracé avec sa valeur avant', async () => {
    const { creneaux } = (await requete('GET', '', intervenant)).json<MesDisponibilites>();
    const cible = creneaux.find((c) => c.valableDu === '2099-01-01');
    const reponse = await requete('DELETE', `/creneaux/${cible?.id ?? ''}`, intervenant);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<MesDisponibilites>().creneaux).toHaveLength(2);
    const [trace] = await audits('disponibilite.retirer');
    expect(trace).toMatchObject({
      avant: { creneauId: cible?.id, valableDu: '2099-01-01' },
      apres: null,
    });
    // Déjà retiré : introuvable.
    expect((await requete('DELETE', `/creneaux/${cible?.id ?? ''}`, intervenant)).statusCode).toBe(
      404,
    );
  });

  it('RG-04-18 ne laisse ni lire ni retirer les créneaux d’un autre intervenant', async () => {
    const { creneaux } = (await requete('GET', '', intervenant)).json<MesDisponibilites>();
    expect((await requete('GET', '', autreIntervenant)).json<MesDisponibilites>().creneaux).toEqual(
      [],
    );
    const vol = await requete('DELETE', `/creneaux/${creneaux[0]?.id ?? ''}`, autreIntervenant);
    expect(vol.statusCode).toBe(404);
  });

  it('module 04 section 2 : seul l’intervenant déclare ses disponibilités', async () => {
    expect((await requete('GET', '', scolarite)).statusCode).toBe(403);
    expect((await requete('GET', '', apprenant)).statusCode).toBe(403);
    const saisie = { jourSemaine: 3, heureDebut: '08:00', heureFin: '10:00' };
    expect((await requete('POST', '/creneaux', apprenant, saisie)).statusCode).toBe(403);
  });
});

describe('US-04-10 indisponibilités ponctuelles', () => {
  const debut = `${dansJours(10)}T14:00`;
  const fin = `${dansJours(11)}T12:00`;
  const motif = 'Rendez-vous médical fictif';

  it('RG-04-18 déclare une indisponibilité avec un motif chiffré, absent du journal', async () => {
    const reponse = await requete('POST', '/indisponibilites', intervenant, { debut, fin, motif });
    expect(reponse.statusCode).toBe(201);
    const [ind] = reponse.json<MesDisponibilites>().indisponibilites;
    expect(ind).toMatchObject({ motif });
    // Europe/Paris : 14:00 locale correspond à 12:00 ou 13:00 UTC selon la saison.
    expect(ind?.debut).toMatch(new RegExp(`^${dansJours(10)}T1[23]:00:00`));

    const [ligne] = await owner.db
      .select()
      .from(indisponibiliteIntervenant)
      .where(eq(indisponibiliteIntervenant.id, ind?.id ?? ''));
    expect(ligne?.motifChiffre).toBeTruthy();
    expect(ligne?.motifChiffre).not.toContain('médical');

    const [trace] = await audits('indisponibilite.ajouter');
    expect(trace?.apres).toMatchObject({ indisponibiliteId: ind?.id, motifRenseigne: true });
    expect(JSON.stringify(trace)).not.toContain('médical');
    expect(logs.join('')).not.toContain('médical');
  });

  it('RG-04-18 refuse une indisponibilité qui chevauche, passée ou sans bornes cohérentes', async () => {
    const chevauche = await requete('POST', '/indisponibilites', intervenant, {
      debut: `${dansJours(11)}T08:00`,
      fin: `${dansJours(12)}T08:00`,
    });
    expect(chevauche.statusCode).toBe(400);
    expect(JSON.stringify(chevauche.json())).toContain('chevauche');
    const passee = await requete('POST', '/indisponibilites', intervenant, {
      debut: `${dansJours(-3)}T08:00`,
      fin: `${dansJours(-2)}T08:00`,
    });
    expect(passee.statusCode).toBe(400);
    expect(JSON.stringify(passee.json())).toContain('déjà passée');
    const inversee = await requete('POST', '/indisponibilites', intervenant, {
      debut: `${dansJours(20)}T10:00`,
      fin: `${dansJours(20)}T09:00`,
    });
    expect(inversee.statusCode).toBe(400);
    const tropLong = await requete('POST', '/indisponibilites', intervenant, {
      debut: `${dansJours(20)}T10:00`,
      fin: `${dansJours(20)}T10:00`.replace(/^\d{4}/, (a) => String(Number(a) + 2)),
    });
    expect(tropLong.statusCode).toBe(400);
    const motifLong = await requete('POST', '/indisponibilites', intervenant, {
      debut: `${dansJours(30)}T10:00`,
      fin: `${dansJours(30)}T12:00`,
      motif: 'x'.repeat(121),
    });
    expect(motifLong.statusCode).toBe(400);
  });

  it('RG-04-18 montre l’indisponibilité dans la grille sans son motif', async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/api/edt/semaine?etablissementId=${campusId}&debut=${lundi(1)}&intervenantId=${intervenant.personneId}`,
      headers: { cookie: scolarite.cookie, origin: WEB_ORIGIN },
    });
    expect(reponse.statusCode).toBe(200);
    const { disponibilites } = reponse.json<SemaineEdt>();
    expect(disponibilites?.creneaux).toEqual([
      { jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00' },
      { jourSemaine: 4, heureDebut: '10:00', heureFin: '14:00' },
    ]);
    expect(reponse.body).not.toContain('médical');
  });

  it('RG-04-18 retire une indisponibilité et efface son motif', async () => {
    const { indisponibilites } = (await requete('GET', '', intervenant)).json<MesDisponibilites>();
    const id = indisponibilites[0]?.id ?? '';
    const reponse = await requete('DELETE', `/indisponibilites/${id}`, intervenant);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<MesDisponibilites>().indisponibilites).toEqual([]);
    const [ligne] = await owner.db
      .select()
      .from(indisponibiliteIntervenant)
      .where(eq(indisponibiliteIntervenant.id, id));
    expect(ligne?.deletedAt).not.toBeNull();
    expect(ligne?.motifChiffre).toBeNull();
    const [trace] = await audits('indisponibilite.retirer');
    expect(trace).toMatchObject({ avant: { indisponibiliteId: id }, apres: null });
  });

  it('RG-04-18 ignore les créneaux hors de leur période dans la grille', async () => {
    await owner.db.insert(disponibiliteIntervenant).values({
      organisationId: ecole,
      personneId: intervenant.personneId,
      jourSemaine: 2,
      heureDebut: '08:00',
      heureFin: '10:00',
      valableAu: '2020-01-01',
    });
    const reponse = await app.inject({
      method: 'GET',
      url: `/api/edt/semaine?etablissementId=${campusId}&debut=${lundi(1)}&intervenantId=${intervenant.personneId}`,
      headers: { cookie: scolarite.cookie, origin: WEB_ORIGIN },
    });
    expect(reponse.json<SemaineEdt>().disponibilites?.creneaux).toHaveLength(2);
    await owner.db
      .delete(disponibiliteIntervenant)
      .where(eq(disponibiliteIntervenant.valableAu, '2020-01-01'));
  });
});
