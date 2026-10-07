import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type ContactEntreprise,
  type Contrat,
  type ConventionStage,
  type DetailPromotion,
  type Entreprise,
  type Formation,
  type Inscription,
  type LienDocument,
  type ListeContrats,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  auditEvenement,
  contratTuteur,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
  inscriptionStatut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests des contrats';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let referent: string;
const inscriptions: Inscription[] = [];
let lEntreprise: Entreprise;
const tuteurs: ContactEntreprise[] = [];

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

async function compte(code: string, organisationId = ecole) {
  const email = `${code}.${newId()}@contrats.test`;
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom: 'Fictif', prenom: 'Lou', email, userId, compteEtat: 'actif' })
    .returning();
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, organisationId), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: code === 'intervenant' ? 'soi' : 'organisation',
    debut: '2026-01-01',
  });
  if (code === 'administrateur') referent = fiche?.id ?? '';
  return signInCookie(app, email, PASSWORD);
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

const statuts = async (inscriptionId: string) =>
  (
    await owner.db
      .select()
      .from(inscriptionStatut)
      .where(eq(inscriptionStatut.inscriptionId, inscriptionId))
      .orderBy(asc(inscriptionStatut.debut))
  ).map((s) => [s.statut, s.debut, s.fin]);

const contrat = (rang: number, tuteur: number, debut = '2026-10-01') => ({
  inscriptionId: inscriptions[rang]?.id,
  entrepriseId: lEntreprise.id,
  type: 'apprentissage',
  debut,
  fin: '2028-08-31',
  tuteurIds: [tuteurs[tuteur]?.personne.id],
});

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des contrats'],
    [autreEcole, 'Autre école des contrats'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus des contrats' })
    .returning();
  const [annee] = await owner.db
    .insert(anneeScolaire)
    .values({
      organisationId: ecole,
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
    })
    .returning();
  admin = await compte('administrateur');
  const formation = (
    await requete('POST', '/api/formations', admin, {
      intitule: 'BTS Négociation fictive',
      type: 'bts',
      niveau: 5,
      dureeAnnees: 2,
      modes: ['initial', 'apprentissage'],
      etablissementIds: [campus?.id],
    })
  ).json<Formation>();
  const version = formation.versions[0]?.id ?? '';
  await requete('POST', `/api/maquettes/${version}/ues`, admin, {
    code: 'UE1',
    intitule: 'Négociation',
    ects: 30,
  });
  await requete('POST', `/api/maquettes/${version}/publication`, admin);
  const promo = (
    await requete('POST', '/api/promotions', admin, {
      formationId: formation.id,
      anneeFormation: 1,
      anneeScolaireId: annee?.id,
      etablissementId: campus?.id,
    })
  ).json<DetailPromotion>();
  const fiches = await owner.db
    .insert(personne)
    .values(
      ['Aubert', 'Blanc', 'Carpentier', 'Durand'].map((nom) => ({
        organisationId: ecole,
        nom,
        prenom: 'Sacha',
        email: `${nom.toLowerCase()}.${newId()}@contrats.test`,
      })),
    )
    .returning();
  for (const fiche of fiches) {
    const reponse = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: fiche.id,
      statut: 'initial',
    });
    inscriptions.push(reponse.json<Inscription>());
  }
  lEntreprise = (
    await requete('POST', '/api/entreprises', admin, {
      siret: siret('3141592653589'),
      raisonSociale: 'Menuiserie fictive',
      idcc: '1486',
    })
  ).json<Entreprise>();
  for (const [prenom, type] of [
    ['Noa', 'tuteur'],
    ['Lina', 'tuteur'],
    ['Eden', 'tuteur'],
    ['Rami', 'rh'],
  ] as const) {
    const reponse = await requete('POST', `/api/entreprises/${lEntreprise.id}/contacts`, admin, {
      type,
      personne: { nom: 'Maître', prenom, email: `${prenom.toLowerCase()}.${newId()}@ent.test` },
    });
    tuteurs.push(reponse.json<ContactEntreprise>());
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-03-03 et E-03-04 contrats d’alternance', () => {
  let premier: Contrat;

  it('US-03-02 RG-03-05 enregistre un contrat en brouillon avec un tuteur de l’entreprise', async () => {
    const sansTuteur = await requete('POST', '/api/contrats', admin, contrat(0, 3));
    expect(sansTuteur.statusCode).toBe(400);
    expect(sansTuteur.json<{ details: string[] }>().details[0]).toContain('tuteurIds');
    const pro = await requete('POST', '/api/contrats', admin, {
      ...contrat(0, 0),
      type: 'professionnalisation',
    });
    expect(pro.json<{ details: string[] }>().details[0]).toContain('type');
    const dates = await requete('POST', '/api/contrats', admin, {
      ...contrat(0, 0),
      fin: '2026-09-30',
    });
    expect(dates.json<{ details: string[] }>().details[0]).toContain('fin');
    const reponse = await requete('POST', '/api/contrats', admin, {
      ...contrat(0, 0),
      referentId: referent,
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    premier = reponse.json<Contrat>();
    expect(premier).toMatchObject({
      statut: 'brouillon',
      opco: 'atlas',
      referent: { id: referent },
      tuteurs: [{ personne: { prenom: 'Noa' }, debut: '2026-10-01', fin: null }],
      avertissements: [{ type: 'entreprise-a-verifier', tuteurId: null }],
      modifiable: true,
    });
    // Un brouillon ne change pas encore le statut de l'apprenant.
    expect(await statuts(premier.apprenant.inscriptionId)).toEqual([
      ['initial', '2026-09-01', null],
    ]);
  });

  it('RG-03-06 le contrat signé passe l’inscription en apprenti à sa date de début', async () => {
    const saut = await requete('PATCH', `/api/contrats/${premier.id}`, admin, {
      statut: 'en_cours',
    });
    expect(saut.statusCode).toBe(400);
    const signe = await requete('PATCH', `/api/contrats/${premier.id}`, admin, {
      statut: 'signe',
      numeroDepot: 'DEP-0001',
    });
    expect(signe.statusCode, signe.body).toBe(200);
    expect(await statuts(premier.apprenant.inscriptionId)).toEqual([
      ['initial', '2026-09-01', '2026-10-01'],
      ['apprenti', '2026-10-01', null],
    ]);
    const [audit] = await owner.db
      .select()
      .from(auditEvenement)
      .where(eq(auditEvenement.objetId, premier.id))
      .orderBy(desc(auditEvenement.id));
    expect(audit).toMatchObject({ action: 'contrat.modifier', objetType: 'contrat' });
  });

  it('RG-03-09 jamais deux contrats en cours sur la même période ; un brouillon se supprime', async () => {
    const second = (
      await requete('POST', '/api/contrats', admin, contrat(0, 1, '2027-01-01'))
    ).json<Contrat>();
    const refus = await requete('PATCH', `/api/contrats/${second.id}`, admin, { statut: 'signe' });
    expect(refus.statusCode).toBe(400);
    expect(refus.json<{ details: string[] }>().details[0]).toContain('RG-03-09');
    expect((await requete('DELETE', `/api/contrats/${second.id}`, admin)).statusCode).toBe(204);
    expect((await requete('DELETE', `/api/contrats/${premier.id}`, admin)).statusCode).toBe(409);
  });

  it('RG-03-04 avertit, sans bloquer, au-delà de deux apprentis par maître d’apprentissage', async () => {
    for (const rang of [1, 2]) {
      const c = (await requete('POST', '/api/contrats', admin, contrat(rang, 0))).json<Contrat>();
      await requete('PATCH', `/api/contrats/${c.id}`, admin, { statut: 'signe' });
    }
    const troisieme = (await requete('GET', '/api/contrats', admin)).json<ListeContrats>().contrats;
    expect(troisieme).toHaveLength(3);
    expect(troisieme.every((c) => c.avertissements.some((a) => a.type === 'capacite-maitre'))).toBe(
      true,
    );
    // Un apprenti dont la formation est prolongée compte à part.
    await requete('PATCH', `/api/contrats/${premier.id}`, admin, { formationProlongee: true });
    const apres = (await requete('GET', `/api/contrats/${premier.id}`, admin)).json<Contrat>();
    expect(apres.avertissements.map((a) => a.type)).toEqual(['entreprise-a-verifier']);
  });

  it('section 7 : un nouveau tuteur à une date d’effet ; l’ancien perd l’accès ce jour-là', async () => {
    const hors = await requete('POST', `/api/contrats/${premier.id}/tuteurs`, admin, {
      personneId: tuteurs[1]?.personne.id,
      date: '2029-01-01',
      remplace: tuteurs[0]?.personne.id,
    });
    expect(hors.statusCode).toBe(400);
    const reponse = await requete('POST', `/api/contrats/${premier.id}/tuteurs`, admin, {
      personneId: tuteurs[1]?.personne.id,
      date: '2027-02-01',
      remplace: tuteurs[0]?.personne.id,
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(reponse.json<Contrat>().tuteurs.map((t) => [t.personne.prenom, t.debut, t.fin])).toEqual(
      [
        ['Noa', '2026-10-01', '2027-02-01'],
        ['Lina', '2027-02-01', null],
      ],
    );
    const deuxieme = await requete('POST', `/api/contrats/${premier.id}/tuteurs`, admin, {
      personneId: tuteurs[2]?.personne.id,
      date: '2027-03-01',
    });
    expect(deuxieme.json<Contrat>().tuteurs).toHaveLength(3);
    const troisieme = await requete('POST', `/api/contrats/${premier.id}/tuteurs`, admin, {
      personneId: tuteurs[0]?.personne.id,
      date: '2027-04-01',
    });
    expect(troisieme.statusCode).toBe(400);
  });

  it('US-03-02 joint le contrat signé en PDF, téléchargé par un lien signé', async () => {
    const image = await app.inject({
      method: 'PUT',
      url: `/api/contrats/${premier.id}/document`,
      headers: { cookie: admin, origin: WEB_ORIGIN, 'content-type': 'application/pdf' },
      payload: Buffer.from('ceci n’est pas un PDF'),
    });
    expect(image.statusCode).toBe(400);
    expect((await requete('GET', `/api/contrats/${premier.id}/document`, admin)).statusCode).toBe(
      404,
    );
    const depot = await app.inject({
      method: 'PUT',
      url: `/api/contrats/${premier.id}/document`,
      headers: { cookie: admin, origin: WEB_ORIGIN, 'content-type': 'application/pdf' },
      payload: Buffer.from('%PDF-1.4\n% contrat fictif\n%%EOF\n'),
    });
    expect(depot.statusCode, depot.body).toBe(200);
    expect(depot.json<Contrat>().document).toBe(true);
    const lien = (
      await requete('GET', `/api/contrats/${premier.id}/document`, admin)
    ).json<LienDocument>();
    expect(lien.url).toContain('X-Amz-Signature');
  });

  it('US-03-12 RG-03-07 rupture : tuteurs fermés, poursuite sans employeur puis retour en initial', async () => {
    const enCours = await requete('PATCH', `/api/contrats/${premier.id}`, admin, {
      statut: 'en_cours',
    });
    expect(enCours.statusCode).toBe(200);
    const horsContrat = await requete('POST', `/api/contrats/${premier.id}/rupture`, admin, {
      date: '2026-09-15',
      motif: 'accord_commun',
    });
    expect(horsContrat.statusCode).toBe(400);
    const reponse = await requete('POST', `/api/contrats/${premier.id}/rupture`, admin, {
      date: '2027-02-15',
      motif: 'accord_commun',
      poursuiteSansEmployeur: true,
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    const rompu = reponse.json<Contrat>();
    expect(rompu).toMatchObject({
      statut: 'rompu',
      rupture: { date: '2027-02-15', motif: 'accord_commun', sansEmployeurJusquau: '2027-08-15' },
    });
    // Le tuteur futur est retiré ; les autres perdent l'accès le jour de la rupture.
    expect(rompu.tuteurs.map((t) => [t.personne.prenom, t.fin])).toEqual([
      ['Noa', '2027-02-01'],
      ['Lina', '2027-02-15'],
    ]);
    const restants = await owner.db
      .select()
      .from(contratTuteur)
      .where(eq(contratTuteur.contratId, premier.id));
    expect(restants).toHaveLength(2);
    expect(await statuts(premier.apprenant.inscriptionId)).toEqual([
      ['initial', '2026-09-01', '2026-10-01'],
      ['apprenti', '2026-10-01', '2027-08-15'],
      ['initial', '2027-08-15', null],
    ]);
    expect(
      (await requete('PATCH', `/api/contrats/${premier.id}`, admin, { numeroDepot: 'X' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await requete('POST', `/api/contrats/${premier.id}/rupture`, admin, {
          date: '2027-02-16',
          motif: 'autre',
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('US-03-15 conventions de stage', () => {
  const convention = (heures: number, extra: Record<string, unknown> = {}) => ({
    inscriptionId: inscriptions[3]?.id,
    entrepriseId: lEntreprise.id,
    tuteurId: tuteurs[2]?.personne.id,
    referentId: referent,
    debut: '2027-04-01',
    fin: '2027-06-30',
    heuresPresence: heures,
    missions: 'Assister le chef d’atelier',
    ...extra,
  });

  it('RG-03-23 bloque un stage de 400 heures sans gratification, sauf dérogation tracée', async () => {
    const bloque = await requete('POST', '/api/conventions-stage', admin, convention(400));
    expect(bloque.statusCode).toBe(400);
    expect(bloque.json<{ details: string[] }>().details[0]).toContain('308 heures');
    const derogation = await requete(
      'POST',
      '/api/conventions-stage',
      admin,
      convention(400, { derogationMotif: 'Stage obligatoire à l’étranger, accord du rectorat' }),
    );
    expect(derogation.statusCode, derogation.body).toBe(201);
    expect(derogation.json<ConventionStage>()).toMatchObject({
      statut: 'brouillon',
      tuteur: { prenom: 'Eden' },
      controles: [{ type: 'gratification-obligatoire', heures: 400, seuil: 308 }],
    });
    // L'apprenant reste en formation initiale (RG-03-24).
    expect(await statuts(inscriptions[3]?.id ?? '')).toEqual([['initial', '2026-09-01', null]]);
  });

  it('RG-03-23 signale une gratification insuffisante et un stage de 7 mois dans le même organisme', async () => {
    const reponse = await requete(
      'POST',
      '/api/conventions-stage',
      admin,
      convention(700, { gratificationHoraire: 300 }),
    );
    expect(reponse.statusCode, reponse.body).toBe(201);
    const c = reponse.json<ConventionStage>();
    expect(c.controles).toEqual([
      { type: 'gratification-insuffisante', montant: 300, minimum: 450 },
      { type: 'duree-maximale', heures: 1100, maximum: 924 },
    ]);
    const annulee = await requete('PATCH', `/api/conventions-stage/${c.id}`, admin, {
      statut: 'annulee',
    });
    expect(annulee.statusCode, annulee.body).toBe(200);
    expect(
      (await requete('PATCH', `/api/conventions-stage/${c.id}`, admin, { statut: 'signee' }))
        .statusCode,
    ).toBe(409);
  });

  it('RG-03-22 le tuteur est un tuteur de l’entreprise ; un alternant n’a pas de convention', async () => {
    const rh = await requete(
      'POST',
      '/api/conventions-stage',
      admin,
      convention(100, { tuteurId: tuteurs[3]?.personne.id }),
    );
    expect(rh.statusCode).toBe(400);
    const sansReferent = await requete('POST', '/api/conventions-stage', admin, {
      ...convention(100),
      referentId: undefined,
    });
    expect(sansReferent.statusCode).toBe(400);
    const alternant = await requete('POST', '/api/conventions-stage', admin, {
      ...convention(100),
      inscriptionId: inscriptions[1]?.id,
    });
    expect(alternant.json<{ details: string[] }>().details[0]).toContain('RG-03-24');
  });
});

describe('section 2 : droits sur les contrats', () => {
  it('la direction lit sans modifier ; un intervenant n’y a pas accès ; une autre école ne voit rien', async () => {
    const liste = (await requete('GET', '/api/contrats', admin)).json<ListeContrats>();
    const id = liste.contrats[0]?.id ?? '';
    // E-01-05 : sur la fiche d'un apprenant, ses inscriptions en cours accompagnent ses contrats.
    const fiche = (
      await requete('GET', `/api/contrats?personneId=${inscriptions[0]?.personne.id ?? ''}`, admin)
    ).json<ListeContrats>();
    expect(fiche.contrats).toHaveLength(1);
    expect(fiche.inscriptions).toEqual([
      {
        id: inscriptions[0]?.id,
        promotion: expect.objectContaining({}) as unknown,
        modifiable: true,
      },
    ]);
    const direction = await compte('direction');
    const lue = (await requete('GET', `/api/contrats/${id}`, direction)).json<Contrat>();
    expect(lue.modifiable).toBe(false);
    expect(
      (await requete('PATCH', `/api/contrats/${id}`, direction, { numeroDepot: 'X' })).statusCode,
    ).toBe(403);
    const intervenant = await compte('intervenant');
    expect((await requete('GET', '/api/contrats', intervenant)).statusCode).toBe(403);
    const ailleurs = await compte('administrateur', autreEcole);
    expect((await requete('GET', `/api/contrats/${id}`, ailleurs)).statusCode).toBe(404);
    expect(
      (await requete('GET', '/api/contrats', ailleurs)).json<ListeContrats>().contrats,
    ).toEqual([]);
  });
});
