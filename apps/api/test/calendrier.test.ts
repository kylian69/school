import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type CalendrierAnnee,
  type Fermeture,
  type ListeAnnees,
  type PropositionDuplication,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
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

const PASSWORD = 'phrase de passe des tests du calendrier';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let scolarite: string;
let campus: string;
let campusEtranger: string;
let anneeEtrangere: string;

async function compte(organisationId: string, email: string, code: string) {
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom: 'Fictif', prenom: 'Noa', email, userId, compteEtat: 'actif' })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: 'organisation',
    debut: '2026-01-01',
  });
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const ANNEE = {
  libelle: '2026-2027',
  dateDebut: '2026-09-01',
  dateFin: '2027-08-31',
  periodes: [
    { libelle: 'S1', dateDebut: '2026-09-01', dateFin: '2027-01-31' },
    { libelle: 'S2', dateDebut: '2027-02-01', dateFin: '2027-07-10' },
  ],
};
const INTRUS = { libelle: 'Intrus', dateDebut: '2026-12-24', dateFin: '2026-12-24', type: 'autre' };

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École du calendrier'],
    [autreEcole, 'Autre école du calendrier'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [local] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus du calendrier' })
    .returning();
  campus = local?.id ?? '';
  const [etranger] = await owner.db
    .insert(etablissement)
    .values({ organisationId: autreEcole, nom: 'Campus étranger' })
    .returning();
  campusEtranger = etranger?.id ?? '';
  const [annee] = await owner.db
    .insert(anneeScolaire)
    .values({
      organisationId: autreEcole,
      libelle: ANNEE.libelle,
      dateDebut: ANNEE.dateDebut,
      dateFin: ANNEE.dateFin,
    })
    .returning();
  anneeEtrangere = annee?.id ?? '';
  await compte(ecole, 'admin.calendrier@exemple.test', 'administrateur');
  await compte(ecole, 'scolarite.calendrier@exemple.test', 'scolarite');
  admin = await signInCookie(app, 'admin.calendrier@exemple.test', PASSWORD);
  scolarite = await signInCookie(app, 'scolarite.calendrier@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-01-03 calendrier de l’année', () => {
  let annee: CalendrierAnnee;

  it('US-01-03 crée une année et ses deux semestres, jours fériés placés', async () => {
    const reponse = await requete('POST', '/api/annees', admin, ANNEE);
    expect(reponse.statusCode).toBe(201);
    annee = reponse.json<CalendrierAnnee>();
    expect(annee).toMatchObject({ libelle: '2026-2027', statut: 'preparation', fermetures: [] });
    expect(annee.periodes.map((p) => [p.libelle, p.ordre])).toEqual([
      ['S1', 1],
      ['S2', 2],
    ]);
    // RG-01-04 : les 11 jours fériés nationaux de l'année, calculés (Pâques 2027 : 28 mars).
    expect(annee.feries).toHaveLength(11);
    expect(annee.feries.find((f) => f.code === 'lundi-de-paques')?.date).toBe('2027-03-29');
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, annee.id));
    expect(trace).toMatchObject({ action: 'annee.creer', organisationId: ecole });
  });

  it('RG-01-03 refuse des périodes qui se chevauchent ou sortent de l’année', async () => {
    const chevauchement = await requete('POST', '/api/annees', admin, {
      ...ANNEE,
      periodes: [
        ANNEE.periodes[0],
        { libelle: 'S2', dateDebut: '2027-01-15', dateFin: '2027-06-30' },
      ],
    });
    expect(chevauchement.statusCode).toBe(400);
    expect(chevauchement.json<{ details: string[] }>().details[0]).toMatch(
      /^periodes\.1 : Deux périodes se chevauchent/,
    );
    const horsAnnee = await requete('POST', '/api/annees', admin, {
      ...ANNEE,
      periodes: [{ libelle: 'S1', dateDebut: '2026-08-01', dateFin: '2027-01-31' }],
    });
    expect(horsAnnee.statusCode).toBe(400);
    const sansPeriode = await requete('POST', '/api/annees', admin, { ...ANNEE, periodes: [] });
    expect(sansPeriode.statusCode).toBe(400);
  });

  it('RG-01-04 ajoute des fermetures pour tous les établissements ou certains', async () => {
    const toussaint = await requete('POST', `/api/annees/${annee.id}/fermetures`, admin, {
      libelle: 'Vacances de la Toussaint',
      dateDebut: '2026-10-24',
      dateFin: '2026-11-01',
      type: 'vacances',
    });
    expect(toussaint.statusCode).toBe(201);
    expect(toussaint.json<Fermeture>().etablissementIds).toEqual([]);

    const pont = await requete('POST', `/api/annees/${annee.id}/fermetures`, admin, {
      libelle: 'Pont de l’Ascension',
      dateDebut: '2027-05-07',
      dateFin: '2027-05-07',
      type: 'autre',
      etablissementIds: [campus],
    });
    const fermeture = pont.json<Fermeture>();
    expect(fermeture.etablissementIds).toEqual([campus]);

    const modifiee = await requete('PUT', `/api/fermetures/${fermeture.id}`, admin, {
      libelle: 'Pont de l’Ascension',
      dateDebut: '2027-05-07',
      dateFin: '2027-05-08',
      type: 'autre',
      etablissementIds: [],
    });
    expect(modifiee.json<Fermeture>()).toMatchObject({
      dateFin: '2027-05-08',
      etablissementIds: [],
    });

    const lu = (await requete('GET', `/api/annees/${annee.id}`, admin)).json<CalendrierAnnee>();
    expect(lu.fermetures.map((f) => f.libelle)).toEqual([
      'Vacances de la Toussaint',
      'Pont de l’Ascension',
    ]);
    expect((await requete('DELETE', `/api/fermetures/${fermeture.id}`, admin)).statusCode).toBe(
      204,
    );
  });

  it('refuse une fermeture hors de l’année ou sur l’établissement d’une autre école', async () => {
    const horsAnnee = await requete('POST', `/api/annees/${annee.id}/fermetures`, admin, {
      libelle: 'Été',
      dateDebut: '2027-08-15',
      dateFin: '2027-09-05',
      type: 'vacances',
    });
    expect(horsAnnee.statusCode).toBe(400);
    expect(horsAnnee.json<{ details: string[] }>().details[0]).toMatch(/rester dans l’année/);
    const etranger = await requete('POST', `/api/annees/${annee.id}/fermetures`, admin, {
      ...INTRUS,
      etablissementIds: [campusEtranger],
    });
    expect(etranger.statusCode).toBe(400);
  });

  it('modifie les périodes et refuse de raccourcir l’année sous une fermeture, avant et après tracés', async () => {
    const [s1] = annee.periodes;
    const reponse = await requete('PATCH', `/api/annees/${annee.id}`, admin, {
      periodes: [
        { id: s1?.id, libelle: 'T1', dateDebut: '2026-09-01', dateFin: '2026-12-20' },
        { libelle: 'T2', dateDebut: '2027-01-04', dateFin: '2027-03-31' },
        { libelle: 'T3', dateDebut: '2027-04-01', dateFin: '2027-06-30' },
      ],
    });
    expect(reponse.statusCode).toBe(200);
    const apres = reponse.json<CalendrierAnnee>();
    expect(apres.periodes.map((p) => p.libelle)).toEqual(['T1', 'T2', 'T3']);
    expect(apres.periodes[0]?.id).toBe(s1?.id);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, annee.id), eq(auditEvenement.action, 'annee.modifier')),
      );
    expect(trace?.avant).toMatchObject({ periodes: [{ libelle: 'S1' }, { libelle: 'S2' }] });

    const raccourcie = await requete('PATCH', `/api/annees/${annee.id}`, admin, {
      dateDebut: '2026-11-01',
    });
    expect(raccourcie.statusCode).toBe(400);
  });

  it('RG-00-05 fait avancer le statut, puis fige l’année clôturée', async () => {
    const enCours = await requete('PATCH', `/api/annees/${annee.id}`, admin, {
      statut: 'en_cours',
    });
    expect(enCours.json<CalendrierAnnee>().statut).toBe('en_cours');
    const retour = await requete('PATCH', `/api/annees/${annee.id}`, admin, {
      statut: 'preparation',
    });
    expect(retour.statusCode).toBe(400);
    expect((await requete('DELETE', `/api/annees/${annee.id}`, admin)).statusCode).toBe(409);
    await requete('PATCH', `/api/annees/${annee.id}`, admin, { statut: 'cloturee' });
    const figee = await requete('PATCH', `/api/annees/${annee.id}`, admin, {
      libelle: 'Corrigée',
    });
    expect(figee.statusCode).toBe(409);
    expect(figee.json<{ message: string }>().message).toMatch(/lecture seule/);
  });

  it('supprime une année en préparation', async () => {
    const brouillon = (
      await requete('POST', '/api/annees', admin, { ...ANNEE, libelle: 'Brouillon' })
    ).json<CalendrierAnnee>();
    expect((await requete('DELETE', `/api/annees/${brouillon.id}`, admin)).statusCode).toBe(204);
    const liste = (await requete('GET', '/api/annees', admin)).json<ListeAnnees>();
    expect(liste.annees.map((a) => a.libelle)).toEqual(['2026-2027']);
  });

  it('donne la lecture à la scolarité, sans modification', async () => {
    expect((await requete('GET', '/api/annees', scolarite)).statusCode).toBe(200);
    expect((await requete('GET', `/api/annees/${annee.id}`, scolarite)).statusCode).toBe(200);
    expect((await requete('POST', '/api/annees', scolarite, ANNEE)).statusCode).toBe(403);
  });

  it('ne voit ni ne modifie le calendrier d’une autre école', async () => {
    expect((await requete('GET', `/api/annees/${anneeEtrangere}`, admin)).statusCode).toBe(404);
    expect(
      (await requete('POST', `/api/annees/${anneeEtrangere}/fermetures`, admin, INTRUS)).statusCode,
    ).toBe(404);
  });
});

describe('US-01-04 duplication de l’année', () => {
  it('RG-01-05 propose l’année suivante décalée d’un an, puis la crée après vérification', async () => {
    const [source] = (await requete('GET', '/api/annees', admin)).json<ListeAnnees>().annees;
    const reponse = await requete('GET', `/api/annees/${source?.id}/duplication`, admin);
    expect(reponse.statusCode).toBe(200);
    const proposition = reponse.json<PropositionDuplication>();
    expect(proposition).toMatchObject({
      libelle: '2027-2028',
      dateDebut: '2027-09-01',
      dateFin: '2028-08-31',
      periodes: [{ libelle: 'T1', dateDebut: '2027-09-01', dateFin: '2027-12-20' }, {}, {}],
      fermetures: [{ libelle: 'Vacances de la Toussaint', dateDebut: '2027-10-24' }],
      dupliqueDe: source?.id,
    });

    const creee = await requete('POST', '/api/annees', admin, proposition);
    expect(creee.statusCode).toBe(201);
    const annee = creee.json<CalendrierAnnee>();
    expect(annee).toMatchObject({ statut: 'preparation', periodes: [{}, {}, {}] });
    expect(annee.fermetures.map((f) => f.dateFin)).toEqual(['2027-11-01']);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(and(eq(auditEvenement.objetId, annee.id), eq(auditEvenement.action, 'annee.creer')));
    expect(trace?.apres).toMatchObject({ dupliqueDe: source?.id });
  });

  it('refuse une fermeture reprise hors de la nouvelle année, et la duplication sans droit', async () => {
    const [source] = (await requete('GET', '/api/annees', admin)).json<ListeAnnees>().annees;
    const refus = await requete('POST', '/api/annees', admin, {
      ...ANNEE,
      libelle: 'Avec fermeture hors année',
      fermetures: [{ ...INTRUS, dateDebut: '2025-12-24', dateFin: '2025-12-24' }],
    });
    expect(refus.statusCode).toBe(400);
    expect(refus.json<{ details: string[] }>().details[0]).toMatch(/^fermetures\.0 : /);
    expect(
      (await requete('GET', `/api/annees/${source?.id}/duplication`, scolarite)).statusCode,
    ).toBe(403);
  });
});
