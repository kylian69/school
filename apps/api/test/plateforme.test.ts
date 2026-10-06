import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ClientFiche, NouveauClient } from '@scolaly/contracts';
import { createDatabase, plateformeAudit, plateformeMembre } from '@scolaly/db';
import { DEMO_MODULES_FORMULE } from '@scolaly/db/demo';
import { modulesParFormule, valueAt } from '@scolaly/referentials';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { chargerContexteEcole } from '../src/access/contexte-ecole.js';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { creerSuperAdministrateur } from '../src/modules/plateforme/index.js';
import { AUTH, DATABASE } from '../src/shared/tokens.js';
import type { Database } from '@scolaly/db';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'mot de passe de la console';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
let app: NestFastifyApplication;
let superAdmin: string;
let support: string;
let personne: string;
const owner = createDatabase(inject('migratorUrl'), { max: 1 });

const nouveauClient = (sousDomaine: string, extra: Partial<NouveauClient> = {}): NouveauClient => ({
  type: 'groupe',
  raisonSociale: 'Groupe Horizon fictif',
  sousDomaine,
  formule: 'essentiel',
  volumeApprenants: 1200,
  dateDebut: '2026-09-01',
  dateFin: '2027-08-31',
  administrateur: { nom: 'Claire Fictive', email: 'Claire@Exemple.test' },
  ecoles: [
    { nom: 'École Horizon Commerce', nomAffichage: 'EHC' },
    { nom: 'École Horizon Design', nomAffichage: 'EHD' },
  ],
  ...extra,
});

const requete = (method: 'GET' | 'POST' | 'PUT', url: string, cookie?: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

beforeAll(async () => {
  app = await startApp();
  const auth = app.get<Auth>(AUTH);
  await creerSuperAdministrateur({
    auth,
    platformUrl: inject('platformUrl'),
    email: 'equipe@plateforme.exemple.test',
    name: 'Équipe Scolaly',
    password: PASSWORD,
  });
  const { userId: supportId } = await createPasswordAccount(auth, {
    email: 'support@plateforme.exemple.test',
    name: 'Support',
    password: PASSWORD,
  });
  await owner.db.insert(plateformeMembre).values({ userId: supportId, role: 'support' });
  await createPasswordAccount(auth, {
    email: 'ecole@exemple.test',
    name: 'École',
    password: PASSWORD,
  });
  superAdmin = await signInCookie(app, 'equipe@plateforme.exemple.test', PASSWORD);
  support = await signInCookie(app, 'support@plateforme.exemple.test', PASSWORD);
  personne = await signInCookie(app, 'ecole@exemple.test', PASSWORD);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('Console de la plateforme : accès', () => {
  it("n'existe pas pour qui n'est pas de l'équipe Scolaly", async () => {
    expect((await requete('GET', '/api/plateforme/clients')).statusCode).toBe(401);
    expect((await requete('GET', '/api/plateforme/clients', personne)).statusCode).toBe(404);
  });

  it('le support consulte mais ne crée pas de client', async () => {
    expect((await requete('GET', '/api/plateforme/clients', support)).statusCode).toBe(200);
    const creation = await requete(
      'POST',
      '/api/plateforme/clients',
      support,
      nouveauClient('support-essai'),
    );
    expect(creation.statusCode).toBe(404);
  });

  it("n'est pas montée en auto-hébergement", async () => {
    const autoHeberge = await startApp({ SCOLALY_MODE: 'auto_heberge' });
    try {
      const cookie = await signInCookie(autoHeberge, 'equipe@plateforme.exemple.test', PASSWORD);
      const reponse = await autoHeberge.inject({
        method: 'GET',
        url: '/api/plateforme/clients',
        headers: { cookie },
      });
      expect(reponse.statusCode).toBe(404);
    } finally {
      await autoHeberge.close();
    }
  });
});

describe('US-19-01 créer le client d’un devis signé en une opération', () => {
  it('crée le groupe, ses écoles, le contrat, les modules de la formule et la trace', async () => {
    const reponse = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('horizon'),
    );
    expect(reponse.statusCode).toBe(201);
    const fiche = reponse.json<ClientFiche>();
    expect(fiche).toMatchObject({
      type: 'groupe',
      etat: 'actif',
      sousDomaine: 'horizon',
      administrateur: { email: 'claire@exemple.test' },
      contrat: { formule: 'essentiel', volumeApprenants: 1200 },
    });
    expect(fiche.ecoles.map((e) => e.nomAffichage)).toEqual(['EHC', 'EHD']);
    expect(fiche.ecoles.every((e) => e.acces === 'complet')).toBe(true);
    const essentiel = valueAt(modulesParFormule, aujourdhui(), 'essentiel').valeur;
    expect(fiche.modules.map((m) => m.module)).toEqual([...essentiel].sort());
    expect(fiche.modules.every((m) => m.actif && m.origine === 'formule')).toBe(true);
    expect(fiche.historique).toMatchObject([{ etatPrecedent: null, etat: 'actif' }]);
    const traces = await owner.db
      .select()
      .from(plateformeAudit)
      .where(eq(plateformeAudit.objetId, fiche.id));
    expect(traces.map((t) => t.action)).toEqual(['client.creer']);
  });

  it('refuse un sous-domaine réservé, déjà pris ou mal formé, avec un message clair', async () => {
    const reserve = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('api'),
    );
    expect(reserve.statusCode).toBe(400);
    expect(reserve.json<{ message: string }>().message).toMatch(/réservé/);
    await requete('POST', '/api/plateforme/clients', superAdmin, nouveauClient('doublon'));
    const pris = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('doublon'),
    );
    expect(pris.statusCode).toBe(409);
    const format = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('a_b'),
    );
    expect(format.statusCode).toBe(400);
  });

  it('refuse des dates incohérentes ou plusieurs écoles pour une organisation seule', async () => {
    const dates = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('dates', { dateFin: '2026-01-01' }),
    );
    expect(dates.statusCode).toBe(400);
    expect(JSON.stringify(dates.json())).toMatch(/fin du contrat doit suivre/);
    const seule = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('seule', { type: 'organisation' }),
    );
    expect(JSON.stringify(seule.json())).toMatch(/une seule école/);
  });

  it('liste les clients avec filtres', async () => {
    await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('filtre-pro', { formule: 'pro', raisonSociale: 'Institut Filtre' }),
    );
    const pro = await requete('GET', '/api/plateforme/clients?formule=pro&q=filtre', superAdmin);
    expect(pro.json<{ clients: { sousDomaine: string; ecoles: number }[] }>().clients).toEqual([
      expect.objectContaining({ sousDomaine: 'filtre-pro', ecoles: 2 }),
    ]);
  });
});

describe('US-19-05 suspendre puis réactiver un client', () => {
  it("met ses écoles en lecture seule, puis rétablit l'accès, avec motif et historique", async () => {
    const creation = await requete(
      'POST',
      '/api/plateforme/clients',
      superAdmin,
      nouveauClient('suspension'),
    );
    const { id, ecoles } = creation.json<ClientFiche>();
    const db = app.get<Database>(DATABASE);
    const ecole = ecoles[0]?.id ?? '';

    const suspendu = await requete('POST', `/api/plateforme/clients/${id}/etat`, superAdmin, {
      etat: 'suspendu',
      motif: 'Impayé de septembre',
    });
    expect(suspendu.statusCode).toBe(200);
    expect(suspendu.json<ClientFiche>().ecoles.every((e) => e.acces === 'lecture_seule')).toBe(
      true,
    );
    expect((await chargerContexteEcole(db, ecole))?.acces).toBe('lecture_seule');

    const reactive = await requete('POST', `/api/plateforme/clients/${id}/etat`, superAdmin, {
      etat: 'actif',
      motif: 'Paiement reçu',
    });
    expect(reactive.json<ClientFiche>().historique.map((h) => h.etat)).toEqual([
      'actif',
      'suspendu',
      'actif',
    ]);
    expect((await chargerContexteEcole(db, ecole))?.acces).toBe('complet');
  });

  it('refuse un changement sans motif ou impossible', async () => {
    const { id } = (
      await requete('POST', '/api/plateforme/clients', superAdmin, nouveauClient('refus'))
    ).json<ClientFiche>();
    expect(
      (
        await requete('POST', `/api/plateforme/clients/${id}/etat`, superAdmin, {
          etat: 'suspendu',
          motif: '',
        })
      ).statusCode,
    ).toBe(400);
    await requete('POST', `/api/plateforme/clients/${id}/etat`, superAdmin, {
      etat: 'resilie',
      motif: 'Fin de contrat',
    });
    const impossible = await requete('POST', `/api/plateforme/clients/${id}/etat`, superAdmin, {
      etat: 'actif',
      motif: 'Erreur',
    });
    expect(impossible.statusCode).toBe(400);
    expect(impossible.json<{ message: string }>().message).toMatch(/n’est pas possible/);
  });
});

describe('US-19-04 modules hors formule', () => {
  it('ouvre un module par exception, en ferme un de la formule, puis le rétablit', async () => {
    const { id, ecoles } = (
      await requete('POST', '/api/plateforme/clients', superAdmin, nouveauClient('modules'))
    ).json<ClientFiche>();
    const db = app.get<Database>(DATABASE);
    const ecole = ecoles[1]?.id ?? '';
    const module = (fiche: ClientFiche, code: string) =>
      fiche.modules.find((m) => m.module === code);

    const jurys = (
      await requete('PUT', `/api/plateforme/clients/${id}/modules`, superAdmin, {
        module: 'jurys',
        actif: true,
      })
    ).json<ClientFiche>();
    expect(module(jurys, 'jurys')).toEqual({ module: 'jurys', actif: true, origine: 'exception' });
    const sansNotes = (
      await requete('PUT', `/api/plateforme/clients/${id}/modules`, superAdmin, {
        module: 'notes',
        actif: false,
      })
    ).json<ClientFiche>();
    expect(module(sansNotes, 'notes')).toEqual({
      module: 'notes',
      actif: false,
      origine: 'exception',
    });
    const contexte = await chargerContexteEcole(db, ecole);
    expect(contexte?.modules.has('jurys')).toBe(true);
    expect(contexte?.modules.has('notes')).toBe(false);

    const retour = (
      await requete('PUT', `/api/plateforme/clients/${id}/modules`, superAdmin, {
        module: 'notes',
        actif: true,
      })
    ).json<ClientFiche>();
    expect(module(retour, 'notes')).toEqual({ module: 'notes', actif: true, origine: 'formule' });
  });
});

describe('Jeu de démonstration', () => {
  it('ses modules sont ceux de la formule Pro', () => {
    expect([...DEMO_MODULES_FORMULE].sort()).toEqual(
      [...valueAt(modulesParFormule, aujourdhui(), 'pro').valeur].sort(),
    );
  });
});
