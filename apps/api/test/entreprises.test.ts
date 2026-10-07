import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type ContactEntreprise,
  type Entreprise,
  type ListeEntreprises,
  type RechercheSiret,
} from '@scolaly/contracts';
import {
  attribution,
  createDatabase,
  entreprise,
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

const PASSWORD = 'phrase de passe des tests des entreprises';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
let annuaire: Server;
let appels = 0;
let panne = false;
const ecole = newId();
const autreEcole = newId();
let admin: string;

/** SIRET valide (clé de Luhn) à partir de 13 chiffres. */
function siret(debut: string): string {
  for (let cle = 0; cle < 10; cle++) {
    const candidat = `${debut}${String(cle)}`;
    let somme = 0;
    for (let i = 0; i < 14; i++) {
      const c = Number(candidat[13 - i]);
      const v = i % 2 === 1 ? c * 2 : c;
      somme += v > 9 ? v - 9 : v;
    }
    if (somme % 10 === 0) return candidat;
  }
  throw new Error('SIRET impossible');
}
const SIRET_CONNU = siret('1234567890001');
const SIRET_FERME = siret('1234567890002');
const SIRET_INCONNU = siret('9876543210001');

async function compte(code: string) {
  const email = `${code}.${newId()}@entreprises.test`;
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
      prenom: 'Eli',
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
  return signInCookie(app, email, PASSWORD);
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

beforeAll(async () => {
  // Faux annuaire public : deux établissements d'une entreprise fictive, dont un fermé.
  annuaire = createServer((request, response) => {
    appels += 1;
    if (panne) {
      response.writeHead(503);
      response.end();
      return;
    }
    const q = new URL(request.url ?? '/', 'http://localhost').searchParams.get('q');
    const results =
      q === SIRET_CONNU || q === SIRET_FERME
        ? [
            {
              siren: '123456789',
              nom_raison_sociale: 'ATELIERS FICTIFS',
              complements: { liste_idcc: ['1486'] },
              siege: {
                siret: SIRET_CONNU,
                adresse: '1 rue Fictive',
                code_postal: '99100',
                libelle_commune: 'LUMERAC',
                activite_principale: '62.01Z',
                etat_administratif: 'A',
              },
              matching_etablissements: [
                {
                  siret: SIRET_FERME,
                  adresse: '2 quai Fictif',
                  code_postal: '99200',
                  libelle_commune: 'LUMERAC',
                  etat_administratif: 'F',
                },
              ],
            },
          ]
        : [];
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ results }));
  });
  await new Promise<void>((resolve) => annuaire.listen(0, '127.0.0.1', resolve));
  const { port } = annuaire.address() as AddressInfo;
  app = await startApp({
    ANNUAIRE_ENTREPRISES_URL: `http://127.0.0.1:${String(port)}`,
    ANNUAIRE_ENTREPRISES_DISABLED: false,
  });
  for (const [id, nom] of [
    [ecole, 'École des entreprises'],
    [autreEcole, 'Autre école des entreprises'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  admin = await compte('administrateur');
});

afterAll(async () => {
  await app.close();
  await owner.close();
  annuaire.close();
});

describe('E-03-01 et E-03-02 entreprises', () => {
  let creee: Entreprise;

  it('RG-03-01 contrôle le SIRET et pré-remplit depuis l’annuaire ; RG-03-02 propose l’OPCO', async () => {
    const invalide = await requete('GET', '/api/entreprises/siret/12345678900000', admin);
    expect(invalide.statusCode).toBe(400);
    const reponse = await requete('GET', `/api/entreprises/siret/${SIRET_CONNU}`, admin);
    expect(reponse.json<RechercheSiret>()).toEqual({
      siret: SIRET_CONNU,
      existante: null,
      annuaire: 'trouve',
      fiche: {
        siren: '123456789',
        raisonSociale: 'ATELIERS FICTIFS',
        adresse: '1 rue Fictive',
        codePostal: '99100',
        ville: 'LUMERAC',
        naf: '62.01Z',
        effectif: null,
        ferme: false,
        idcc: '1486',
        opcoPropose: 'atlas',
      },
    });
    // Section 9 : la réponse est gardée en cache (30 jours).
    const avant = appels;
    await requete('GET', `/api/entreprises/siret/${SIRET_CONNU}`, admin);
    expect(appels).toBe(avant);
  });

  it('US-03-01 crée l’entreprise par son SIRET seul ; un doublon renvoie vers la fiche', async () => {
    const reponse = await requete('POST', '/api/entreprises', admin, { siret: SIRET_CONNU });
    expect(reponse.statusCode, reponse.body).toBe(201);
    creee = reponse.json<Entreprise>();
    expect(creee).toMatchObject({
      raisonSociale: 'ATELIERS FICTIFS',
      idcc: '1486',
      opco: 'atlas',
      statut: 'active',
      aVerifier: false,
      contacts: [],
    });
    const doublon = await requete('POST', '/api/entreprises', admin, { siret: SIRET_CONNU });
    expect(doublon.statusCode).toBe(409);
    expect(doublon.json<{ details: string[] }>().details).toEqual([`existante : ${creee.id}`]);
    const fermee = await requete('POST', '/api/entreprises', admin, { siret: SIRET_FERME });
    expect(fermee.json<Entreprise>().statut).toBe('fermee');
  });

  it('section 7 : SIRET inconnu ou annuaire indisponible, saisie manuelle « à vérifier »', async () => {
    const sansNom = await requete('POST', '/api/entreprises', admin, { siret: SIRET_INCONNU });
    expect(sansNom.statusCode).toBe(400);
    panne = true;
    const recherche = (
      await requete('GET', `/api/entreprises/siret/${siret('5555555555555')}`, admin)
    ).json<RechercheSiret>();
    expect(recherche).toMatchObject({ annuaire: 'indisponible', fiche: null });
    panne = false;
    const manuelle = await requete('POST', '/api/entreprises', admin, {
      siret: SIRET_INCONNU,
      raisonSociale: 'Boulangerie fictive',
      ville: 'Lumerac',
      idcc: '1979',
    });
    expect(manuelle.statusCode, manuelle.body).toBe(201);
    expect(manuelle.json<Entreprise>()).toMatchObject({
      aVerifier: true,
      idcc: '1979',
      opco: 'akto',
    });
    const opco = await requete('PATCH', `/api/entreprises/${creee.id}`, admin, { opco: 'inconnu' });
    expect(opco.statusCode).toBe(400);
    const modifiee = await requete('PATCH', `/api/entreprises/${creee.id}`, admin, {
      opco: 'opco-ep',
      idcc: '16',
    });
    expect(modifiee.json<Entreprise>()).toMatchObject({ opco: 'opco-ep', idcc: '0016' });
  });

  it('RG-03-03 ajoute un tuteur : une fiche avec le rôle tuteur de l’école', async () => {
    const reponse = await requete('POST', `/api/entreprises/${creee.id}/contacts`, admin, {
      type: 'tuteur',
      fonction: 'Responsable d’atelier',
      dansEntrepriseDepuis: '2018-03-01',
      personne: { nom: 'Tuteur', prenom: 'Sam', email: 'Sam.Tuteur@entreprise.test' },
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const contact = reponse.json<ContactEntreprise>();
    expect(contact).toMatchObject({
      type: 'tuteur',
      fonction: 'Responsable d’atelier',
      personne: { email: 'sam.tuteur@entreprise.test', compteEtat: 'cree' },
    });
    const [tuteur] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'tuteur')));
    const roles = await owner.db
      .select()
      .from(attribution)
      .where(
        and(
          eq(attribution.personneId, contact.personne.id),
          eq(attribution.roleId, tuteur?.id ?? ''),
        ),
      );
    expect(roles).toHaveLength(1);
    const doublon = await requete('POST', `/api/entreprises/${creee.id}/contacts`, admin, {
      type: 'rh',
      personne: { nom: 'Autre', prenom: 'Sam', email: 'sam.tuteur@entreprise.test' },
    });
    expect(doublon.statusCode).toBe(409);
    const liste = (
      await requete('GET', '/api/entreprises?q=ateliers', admin)
    ).json<ListeEntreprises>();
    expect(liste.entreprises.find((e) => e.id === creee.id)?.tuteurs).toBe(1);
    const modifie = await requete('PATCH', `/api/contacts-entreprise/${contact.id}`, admin, {
      fonction: 'Chef d’atelier',
    });
    expect(modifie.json<ContactEntreprise>().fonction).toBe('Chef d’atelier');
    expect(
      (await requete('DELETE', `/api/contacts-entreprise/${contact.id}`, admin)).statusCode,
    ).toBe(204);
    expect(
      (await requete('GET', `/api/entreprises/${creee.id}`, admin)).json<Entreprise>().contacts,
    ).toEqual([]);
  });

  it('section 2 : la direction lit sans modifier ; un intervenant n’y a pas accès ; une autre école ne voit rien', async () => {
    const direction = await compte('direction');
    expect((await requete('GET', `/api/entreprises/${creee.id}`, direction)).statusCode).toBe(200);
    expect(
      (await requete('POST', '/api/entreprises', direction, { siret: SIRET_CONNU })).statusCode,
    ).toBe(403);
    const intervenant = await compte('intervenant');
    expect((await requete('GET', '/api/entreprises', intervenant)).statusCode).toBe(403);
    const [etrangere] = await owner.db
      .insert(entreprise)
      .values({
        organisationId: autreEcole,
        siret: SIRET_CONNU,
        siren: '123456789',
        raisonSociale: 'Ailleurs',
      })
      .returning();
    expect(
      (await requete('GET', `/api/entreprises/${etrangere?.id ?? ''}`, admin)).statusCode,
    ).toBe(404);
  });
});
