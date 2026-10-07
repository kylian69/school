import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type CalendrierPromotion,
  type ContactEntreprise,
  type Contrat,
  type DetailPromotion,
  type Entreprise,
  type Formation,
  type Inscription,
  type ListeModelesRythme,
  type ModeleRythme,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  createDatabase,
  etablissement,
  fermeture,
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

const PASSWORD = 'phrase de passe des tests des rythmes';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let promo: DetailPromotion;
const inscriptions: Inscription[] = [];
let contrat: Contrat;

async function compte(code: string, organisationId = ecole) {
  const email = `${code}.${newId()}@rythmes.test`;
  const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
    email,
    name: 'Fictif',
    password: PASSWORD,
  });
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId, nom: 'Fictif', prenom: 'Mia', email, userId, compteEtat: 'actif' })
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

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École des rythmes'],
    [autreEcole, 'Autre école des rythmes'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus des rythmes' })
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
  // Vacances de la Toussaint fictives, pour tous les établissements.
  await owner.db.insert(fermeture).values({
    organisationId: ecole,
    anneeScolaireId: annee?.id ?? '',
    libelle: 'Toussaint',
    dateDebut: '2026-10-19',
    dateFin: '2026-10-30',
    type: 'vacances',
  });
  admin = await compte('administrateur');
  const formation = (
    await requete('POST', '/api/formations', admin, {
      intitule: 'BTS Rythmes fictifs',
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
    intitule: 'Atelier',
    ects: 30,
  });
  await requete('POST', `/api/maquettes/${version}/publication`, admin);
  promo = (
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
      ['Fabre', 'Gauthier'].map((nom) => ({
        organisationId: ecole,
        nom,
        prenom: 'Robin',
        email: `${nom.toLowerCase()}.${newId()}@rythmes.test`,
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
  const lEntreprise = (
    await requete('POST', '/api/entreprises', admin, {
      siret: '99900009900013',
      raisonSociale: 'Scierie fictive',
    })
  ).json<Entreprise>();
  const tuteur = (
    await requete('POST', `/api/entreprises/${lEntreprise.id}/contacts`, admin, {
      type: 'tuteur',
      personne: { nom: 'Maître', prenom: 'Jo', email: `jo.${newId()}@ent.test` },
    })
  ).json<ContactEntreprise>();
  contrat = (
    await requete('POST', '/api/contrats', admin, {
      inscriptionId: inscriptions[0]?.id,
      entrepriseId: lEntreprise.id,
      type: 'apprentissage',
      debut: '2026-09-01',
      fin: '2028-08-31',
      tuteurIds: [tuteur.personne.id],
    })
  ).json<Contrat>();
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('RG-03-10 modèles de rythme', () => {
  it('fournit 5 modèles ; l’école crée, modifie et supprime les siens', async () => {
    const liste = (await requete('GET', '/api/rythmes/modeles', admin)).json<ListeModelesRythme>();
    expect(liste.modeles.filter((m) => m.fourni)).toHaveLength(5);
    const semaine = [
      'ecole',
      'entreprise',
      'entreprise',
      'entreprise',
      'entreprise',
      'ferme',
      'ferme',
    ];
    const sansEcole = await requete('POST', '/api/rythmes/modeles', admin, {
      libelle: 'Que de l’entreprise',
      motif: [semaine.map((j) => (j === 'ecole' ? 'entreprise' : j))],
    });
    expect(sansEcole.statusCode).toBe(400);
    const incomplet = await requete('POST', '/api/rythmes/modeles', admin, {
      libelle: 'Incomplet',
      motif: [['ecole']],
    });
    expect(incomplet.statusCode).toBe(400);
    const cree = await requete('POST', '/api/rythmes/modeles', admin, {
      libelle: 'Lundi à l’école',
      motif: [semaine],
    });
    expect(cree.statusCode, cree.body).toBe(201);
    const modele = cree.json<ModeleRythme>();
    expect(modele).toMatchObject({ libelle: 'Lundi à l’école', fourni: false });
    expect(
      (
        await requete('POST', '/api/rythmes/modeles', admin, {
          libelle: 'Lundi à l’école',
          motif: [semaine],
        })
      ).statusCode,
    ).toBe(409);
    const modifie = await requete('PATCH', `/api/rythmes/modeles/${modele.id}`, admin, {
      libelle: 'Lundi seul à l’école',
    });
    expect(modifie.json<ModeleRythme>().libelle).toBe('Lundi seul à l’école');
    expect((await requete('DELETE', `/api/rythmes/modeles/${modele.id}`, admin)).statusCode).toBe(
      204,
    );
  });
});

describe('RG-03-11 calendrier d’une promotion', () => {
  it('génère « 2 jours / 3 jours » en un clic, fériés et fermetures appliqués', async () => {
    const vide = (
      await requete('GET', `/api/promotions/${promo.id}/rythme`, admin)
    ).json<CalendrierPromotion>();
    expect(vide).toMatchObject({ calendrier: null, exceptions: [], modifiable: true });
    expect(contrat.finPeriodeEssai).toBeNull();
    const avant = await requete('PATCH', `/api/promotions/${promo.id}/rythme/jours`, admin, {
      jours: [{ date: '2026-09-02', type: 'examen' }],
    });
    expect(avant.statusCode).toBe(409);
    const inconnu = await requete('PUT', `/api/promotions/${promo.id}/rythme`, admin, {
      modele: 'inconnu',
    });
    expect(inconnu.statusCode).toBe(400);
    const reponse = await requete('PUT', `/api/promotions/${promo.id}/rythme`, admin, {
      modele: 'deux-jours-ecole',
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    const { calendrier } = reponse.json<CalendrierPromotion>();
    expect(calendrier?.modele).toBe('2 jours école (lundi, mardi) / 3 jours entreprise');
    expect(Object.keys(calendrier?.jours ?? {})).toHaveLength(365);
    expect(calendrier?.jours).toMatchObject({
      '2026-09-01': 'ecole',
      '2026-09-02': 'entreprise',
      '2026-09-05': 'ferme',
      // Vacances : l'apprenti est en entreprise ; 11 novembre : fermé.
      '2026-10-19': 'entreprise',
      '2026-11-11': 'ferme',
    });
  });

  it('RG-03-08 calcule la fin de la période d’essai au 45e jour en entreprise', async () => {
    const lu = (await requete('GET', `/api/contrats/${contrat.id}`, admin)).json<Contrat>();
    expect(lu.finPeriodeEssai).toBe('2026-12-04');
  });

  it('retouche des jours à la main, dans les dates de la promotion', async () => {
    const hors = await requete('PATCH', `/api/promotions/${promo.id}/rythme/jours`, admin, {
      jours: [{ date: '2027-09-01', type: 'examen' }],
    });
    expect(hors.statusCode).toBe(400);
    const reponse = await requete('PATCH', `/api/promotions/${promo.id}/rythme/jours`, admin, {
      jours: [
        { date: '2027-06-14', type: 'examen' },
        { date: '2027-06-15', type: 'examen' },
      ],
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    const { calendrier } = reponse.json<CalendrierPromotion>();
    expect(calendrier?.jours['2027-06-14']).toBe('examen');
    expect(calendrier?.compte.examen).toBe(2);
  });
});

describe('RG-03-12 exceptions individuelles', () => {
  it('remplace le rythme d’un apprenant sur une période, sans chevauchement', async () => {
    const exception = {
      inscriptionId: inscriptions[1]?.id,
      debut: '2027-01-04',
      fin: '2027-01-31',
      modele: 'une-semaine-sur-deux',
      motif: 'Entreprise saisonnière',
    };
    const hors = await requete('POST', `/api/promotions/${promo.id}/rythme/exceptions`, admin, {
      ...exception,
      fin: '2027-09-30',
    });
    expect(hors.statusCode).toBe(400);
    const reponse = await requete(
      'POST',
      `/api/promotions/${promo.id}/rythme/exceptions`,
      admin,
      exception,
    );
    expect(reponse.statusCode, reponse.body).toBe(201);
    const [cree] = reponse.json<CalendrierPromotion>().exceptions;
    expect(cree).toMatchObject({
      apprenant: { inscriptionId: inscriptions[1]?.id, nom: 'Gauthier' },
      motif: 'Entreprise saisonnière',
    });
    expect(cree?.jours['2027-01-04']).toBe('ecole');
    expect(cree?.jours['2027-01-11']).toBe('entreprise');
    expect(
      (
        await requete('POST', `/api/promotions/${promo.id}/rythme/exceptions`, admin, {
          ...exception,
          debut: '2027-01-20',
          fin: '2027-02-10',
        })
      ).statusCode,
    ).toBe(409);
    const retouche = await requete(
      'PATCH',
      `/api/exceptions-rythme/${cree?.id ?? ''}/jours`,
      admin,
      {
        jours: [{ date: '2027-01-11', type: 'ecole' }],
      },
    );
    expect(retouche.json<CalendrierPromotion>().exceptions[0]?.jours['2027-01-11']).toBe('ecole');
    const supprime = await requete('DELETE', `/api/exceptions-rythme/${cree?.id ?? ''}`, admin);
    expect(supprime.json<CalendrierPromotion>().exceptions).toEqual([]);
  });
});

describe('section 2 : droits sur les rythmes', () => {
  it('la scolarité lit sans définir ; un intervenant n’y a pas accès ; une autre école ne voit rien', async () => {
    const scolarite = await compte('scolarite');
    const lu = await requete('GET', `/api/promotions/${promo.id}/rythme`, scolarite);
    expect(lu.json<CalendrierPromotion>().modifiable).toBe(false);
    expect(
      (
        await requete('PUT', `/api/promotions/${promo.id}/rythme`, scolarite, {
          modele: 'deux-jours-ecole',
        })
      ).statusCode,
    ).toBe(403);
    const intervenant = await compte('intervenant');
    expect((await requete('GET', '/api/rythmes/modeles', intervenant)).statusCode).toBe(403);
    const ailleurs = await compte('administrateur', autreEcole);
    expect((await requete('GET', `/api/promotions/${promo.id}/rythme`, ailleurs)).statusCode).toBe(
      404,
    );
  });
});
