import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type DetailPromotion,
  type ElementCree,
  type Formation,
  type Groupe,
  type Inscription,
  type AffectationsPromotion,
  type ListePromotions,
  type ListeSalles,
  type MaFormation,
  type MesEnseignements,
  type Salle,
  type Maquette,
  type ResultatRepartition,
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

const PASSWORD = 'phrase de passe des tests de la scolarité';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let campusA: string;
let campusB: string;
let annee: string;
let admin: string;
let formationId: string;
let version: string;
const apprenants: string[] = [];

let derniereFiche = '';

async function compte(
  code: string,
  perimetre: { type: 'organisation' | 'etablissement' | 'soi'; id: string | null },
) {
  const email = `${code}.${newId()}@scolarite.test`;
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
      prenom: 'Alex',
      email,
      userId,
      compteEtat: 'actif',
    })
    .returning();
  derniereFiche = fiche?.id ?? '';
  const [leRole] = await owner.db
    .select()
    .from(role)
    .where(and(eq(role.organisationId, ecole), eq(role.code, code)));
  await owner.db.insert(attribution).values({
    organisationId: ecole,
    personneId: fiche?.id ?? '',
    roleId: leRole?.id ?? '',
    perimetreType: perimetre.type,
    perimetreId: perimetre.id,
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
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de la scolarité', nomAffichage: 'ESC' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const campus = await owner.db
    .insert(etablissement)
    .values([
      { organisationId: ecole, nom: 'Campus A' },
      { organisationId: ecole, nom: 'Campus B' },
    ])
    .returning();
  campusA = campus[0]?.id ?? '';
  campusB = campus[1]?.id ?? '';
  const [a] = await owner.db
    .insert(anneeScolaire)
    .values({
      organisationId: ecole,
      libelle: '2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
    })
    .returning();
  annee = a?.id ?? '';
  const fiches = await owner.db
    .insert(personne)
    .values(
      ['Bernard', 'Dubois', 'Arnaud', 'Petit', 'Lefèvre', 'Moreau'].map((nom) => ({
        organisationId: ecole,
        nom,
        prenom: 'Camille',
        email: `${nom.toLowerCase()}.${newId()}@scolarite.test`,
      })),
    )
    .returning();
  apprenants.push(...fiches.map((f) => f.id));
  admin = await compte('administrateur', { type: 'organisation', id: null });

  const f = await requete('POST', '/api/formations', admin, {
    intitule: 'BTS Commerce',
    type: 'bts',
    niveau: 5,
    dureeAnnees: 2,
    modes: ['initial', 'apprentissage'],
    etablissementIds: [campusA],
  });
  const laFormation = f.json<Formation>();
  formationId = laFormation.id;
  version = laFormation.versions[0]?.id ?? '';
  const ue = await requete('POST', `/api/maquettes/${version}/ues`, admin, {
    code: 'UE1',
    intitule: 'Vente',
    ects: 30,
  });
  const ueId = ue.json<ElementCree>().id;
  await requete('POST', `/api/maquettes/${version}/ues`, admin, {
    code: 'UE2',
    intitule: 'Anglais',
    option: 'anglais',
  });
  await requete('POST', `/api/maquettes/${version}/modules`, admin, {
    ueId,
    code: 'M1',
    intitule: 'Techniques de vente',
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-02-04 et E-02-05 promotions, inscriptions et groupes', () => {
  let promo: DetailPromotion;
  let inscriptions: Inscription[] = [];
  let td1: Groupe;
  let td2: Groupe;
  const nouvelle = { formationId: '', anneeFormation: 1, anneeScolaireId: '', etablissementId: '' };

  it('RG-02-12 une promotion suit une version publiée ; ses dates sont celles de l’année par défaut', async () => {
    Object.assign(nouvelle, { formationId, anneeScolaireId: annee, etablissementId: campusA });
    const brouillon = await requete('POST', '/api/promotions', admin, nouvelle);
    expect(brouillon.statusCode).toBe(400);
    expect(brouillon.json<{ details: string[] }>().details[0]).toContain('versionId');
    await requete('POST', `/api/maquettes/${version}/publication`, admin);
    const reponse = await requete('POST', '/api/promotions', admin, nouvelle);
    expect(reponse.statusCode, reponse.body).toBe(201);
    promo = reponse.json<DetailPromotion>();
    expect(promo).toMatchObject({
      libelle: 'BTS Commerce · 1re année · 2026-2027',
      dateDebut: '2026-09-01',
      dateFin: '2027-08-31',
      version: { id: version, numero: 1 },
      options: ['anglais'],
      etablissement: { nom: 'Campus A' },
    });
    expect((await requete('POST', '/api/promotions', admin, nouvelle)).statusCode).toBe(409);
    expect(
      (await requete('POST', '/api/promotions', admin, { ...nouvelle, anneeFormation: 3 }))
        .statusCode,
    ).toBe(400);
  });

  it('RG-02-04 RG-02-05 la version suivie par une promotion est « utilisée » et garde ses coefficients', async () => {
    const formation = (
      await requete('GET', `/api/formations/${formationId}`, admin)
    ).json<Formation>();
    expect(formation.versions[0]).toMatchObject({ statut: 'publiee', utilisee: true });
    const maquette = (await requete('GET', `/api/maquettes/${version}`, admin)).json<Maquette>();
    const ue = maquette.ues[0]?.id ?? '';
    const coefficient = await requete('PATCH', `/api/maquettes/${version}/ues/${ue}`, admin, {
      coefficient: 4,
    });
    expect(coefficient.statusCode).toBe(409);
    expect(coefficient.json<{ message: string }>().message).toContain('nouvelle version');
    expect(
      (
        await requete('PATCH', `/api/maquettes/${version}/ues/${ue}`, admin, {
          intitule: 'Vente et conseil',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('US-02-06 RG-02-13 inscrit des apprenants avec leur statut autorisé par la formation', async () => {
    for (const [rang, personneId] of apprenants.entries()) {
      const reponse = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
        personneId,
        statut: rang < 2 ? 'apprenti' : 'initial',
        option: rang === 0 ? 'anglais' : null,
      });
      expect(reponse.statusCode, reponse.body).toBe(201);
    }
    const refus = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: apprenants[0],
      statut: 'initial',
    });
    expect(refus.statusCode).toBe(409);
    const pro = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: apprenants[0],
      statut: 'professionnalisation',
    });
    expect(pro.statusCode).toBe(409);
    const option = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: apprenants[1],
      statut: 'initial',
      option: 'italien',
    });
    expect(option.statusCode).toBe(409);
    promo = (await requete('GET', `/api/promotions/${promo.id}`, admin)).json<DetailPromotion>();
    inscriptions = promo.inscriptions;
    expect(inscriptions.map((i) => i.personne.nom)).toEqual([
      'Arnaud',
      'Bernard',
      'Dubois',
      'Lefèvre',
      'Moreau',
      'Petit',
    ]);
    expect(promo.effectifs).toEqual({
      inscrits: 6,
      preinscrits: 0,
      parStatut: { initial: 4, apprenti: 2, professionnalisation: 0, formation_continue: 0 },
    });
  });

  it('section 7 : un changement de statut ouvre une nouvelle période à la date du contrat', async () => {
    const petit = inscriptions.find((i) => i.personne.nom === 'Petit');
    const reponse = await requete('POST', `/api/inscriptions/${petit?.id ?? ''}/statut`, admin, {
      statut: 'apprenti',
      debut: '2026-11-02',
    });
    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(reponse.json<Inscription>().statuts).toEqual([
      { debut: '2026-09-01', fin: '2026-11-02', statut: 'initial' },
      { debut: '2026-11-02', fin: null, statut: 'apprenti' },
    ]);
    const avant = await requete('POST', `/api/inscriptions/${petit?.id ?? ''}/statut`, admin, {
      statut: 'initial',
      debut: '2026-10-01',
    });
    expect(avant.statusCode).toBe(400);
  });

  it('US-02-07 RG-02-16 répartit en deux TD équilibrés, d’abord en aperçu', async () => {
    for (const libelle of ['TD 1', 'TD 2']) {
      const reponse = await requete('POST', `/api/promotions/${promo.id}/groupes`, admin, {
        libelle,
        type: 'td',
        capacite: 3,
      });
      expect(reponse.statusCode, reponse.body).toBe(201);
      if (libelle === 'TD 1') td1 = reponse.json<Groupe>();
      else td2 = reponse.json<Groupe>();
    }
    const saisie = { groupeIds: [td1.id, td2.id], methode: 'alphabetique', date: '2026-09-01' };
    const apercu = await requete('POST', `/api/promotions/${promo.id}/repartition`, admin, {
      ...saisie,
      apercu: true,
    });
    const proposition = apercu.json<ResultatRepartition>();
    expect(proposition).toMatchObject({ applique: false, nonAffectes: [] });
    expect(proposition.affectations.filter((a) => a.groupeId === td1.id)).toHaveLength(3);
    const avant = (
      await requete('GET', `/api/promotions/${promo.id}`, admin)
    ).json<DetailPromotion>();
    expect(avant.groupes.every((g) => g.effectif === 0)).toBe(true);
    const applique = await requete(
      'POST',
      `/api/promotions/${promo.id}/repartition`,
      admin,
      saisie,
    );
    expect(applique.json<ResultatRepartition>().applique).toBe(true);
    promo = (await requete('GET', `/api/promotions/${promo.id}`, admin)).json<DetailPromotion>();
    expect(promo.groupes.map((g) => g.effectif)).toEqual([3, 3]);
    // Ordre alphabétique : Arnaud, Bernard, Dubois au TD 1.
    const premier = promo.inscriptions.find((i) => i.personne.nom === 'Arnaud');
    expect(premier?.groupes[0]?.groupeId).toBe(td1.id);
  });

  it('section 7 : groupe plein refusé sauf forçage tracé ; changement de groupe à une date', async () => {
    const arnaud = promo.inscriptions.find((i) => i.personne.nom === 'Arnaud');
    const td3 = (
      await requete('POST', `/api/promotions/${promo.id}/groupes`, admin, {
        libelle: 'TD 3',
        type: 'td',
        capacite: 1,
      })
    ).json<Groupe>();
    const deplacement = await requete('POST', `/api/groupes/${td3.id}/membres`, admin, {
      inscriptionIds: [arnaud?.id],
      date: '2026-12-01',
    });
    expect(deplacement.statusCode, deplacement.body).toBe(200);
    const apres = (
      await requete('GET', `/api/promotions/${promo.id}`, admin)
    ).json<DetailPromotion>();
    expect(apres.inscriptions.find((i) => i.id === arnaud?.id)?.groupes).toEqual([
      { groupeId: td1.id, debut: '2026-09-01', fin: '2026-12-01' },
      { groupeId: td3.id, debut: '2026-12-01', fin: null },
    ]);
    const bernard = apres.inscriptions.find((i) => i.personne.nom === 'Bernard');
    const plein = await requete('POST', `/api/groupes/${td3.id}/membres`, admin, {
      inscriptionIds: [bernard?.id],
      date: '2026-12-01',
    });
    expect(plein.statusCode).toBe(409);
    const force = await requete('POST', `/api/groupes/${td3.id}/membres`, admin, {
      inscriptionIds: [bernard?.id],
      date: '2026-12-01',
      forcer: true,
    });
    expect(force.statusCode).toBe(200);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(and(eq(auditEvenement.objetId, td3.id), eq(auditEvenement.action, 'groupe.membres')))
      .orderBy(auditEvenement.id);
    expect(trace).toBeDefined();
    expect((await requete('DELETE', `/api/groupes/${td3.id}`, admin)).statusCode).toBe(409);
  });

  it('RG-02-17 une sortie exige date et motif, et ferme les groupes à cette date', async () => {
    const moreau = promo.inscriptions.find((i) => i.personne.nom === 'Moreau');
    const sansMotif = await requete('PATCH', `/api/inscriptions/${moreau?.id ?? ''}`, admin, {
      etat: 'demissionnaire',
      dateSortie: '2027-01-15',
    });
    expect(sansMotif.statusCode).toBe(400);
    const sortie = await requete('PATCH', `/api/inscriptions/${moreau?.id ?? ''}`, admin, {
      etat: 'demissionnaire',
      dateSortie: '2027-01-15',
      motifSortie: 'Réorientation',
    });
    expect(sortie.statusCode, sortie.body).toBe(200);
    expect(sortie.json<Inscription>().groupes.every((g) => g.fin !== null)).toBe(true);
    const retour = await requete('PATCH', `/api/inscriptions/${moreau?.id ?? ''}`, admin, {
      etat: 'inscrit',
    });
    expect(retour.statusCode).toBe(409);
  });

  it('RG-02-05 changer de version demande un droit spécifique et une confirmation', async () => {
    const copie = (
      await requete('POST', `/api/maquettes/${version}/nouvelle-version`, admin)
    ).json<Maquette>();
    await requete('POST', `/api/maquettes/${copie.version.id}/publication`, admin);
    const scolarite = await compte('scolarite', { type: 'organisation', id: null });
    const refus = await requete('PATCH', `/api/promotions/${promo.id}`, scolarite, {
      versionId: copie.version.id,
      confirmation: true,
    });
    expect(refus.statusCode).toBe(403);
    const sansConfirmation = await requete('PATCH', `/api/promotions/${promo.id}`, admin, {
      versionId: copie.version.id,
    });
    expect(sansConfirmation.statusCode).toBe(409);
    const change = await requete('PATCH', `/api/promotions/${promo.id}`, admin, {
      versionId: copie.version.id,
      confirmation: true,
    });
    expect(change.statusCode, change.body).toBe(200);
    expect(change.json<DetailPromotion>().version.numero).toBe(2);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(
          eq(auditEvenement.objetId, promo.id),
          eq(auditEvenement.action, 'promotion.changer-version'),
        ),
      );
    expect(trace?.avant).toMatchObject({ version: 1 });
  });

  it('US-02-12 un groupe transversal rattache plusieurs promotions', async () => {
    const seconde = (
      await requete('POST', '/api/promotions', admin, { ...nouvelle, anneeFormation: 2 })
    ).json<DetailPromotion>();
    const anglais = await requete('POST', `/api/promotions/${promo.id}/groupes`, admin, {
      libelle: 'Anglais B2',
      type: 'langue',
      autresPromotionIds: [seconde.id],
    });
    expect(anglais.json<Groupe>().promotionIds.sort()).toEqual([promo.id, seconde.id].sort());
    const vue = (
      await requete('GET', `/api/promotions/${seconde.id}`, admin)
    ).json<DetailPromotion>();
    expect(vue.groupes.map((g) => g.libelle)).toEqual(['Anglais B2']);
  });

  it('RG-00-10 la scolarité d’un établissement ne voit que ses promotions', async () => {
    const autre = await compte('scolarite', { type: 'etablissement', id: campusB });
    expect(
      (await requete('GET', '/api/promotions', autre)).json<ListePromotions>().promotions,
    ).toEqual([]);
    expect((await requete('GET', `/api/promotions/${promo.id}`, autre)).statusCode).toBe(404);
    const creation = await requete('POST', '/api/promotions', autre, nouvelle);
    expect(creation.statusCode).toBe(403);
    const locale = await compte('scolarite', { type: 'etablissement', id: campusA });
    const liste = (await requete('GET', '/api/promotions', locale)).json<ListePromotions>();
    expect(liste.promotions.length).toBeGreaterThan(0);
    expect(liste.promotions.every((p) => p.modifiable)).toBe(true);
  });

  it('RG-01-14 attribue un rôle sur le périmètre d’une promotion', async () => {
    const [leRole] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'responsable-pedagogique')));
    const reponse = await requete(
      'POST',
      `/api/personnes/${apprenants[5] ?? ''}/attributions`,
      admin,
      {
        roleId: leRole?.id,
        perimetreType: 'promotion',
        perimetreId: promo.id,
      },
    );
    expect(reponse.statusCode, reponse.body).toBe(201);
    expect(reponse.json<{ perimetreLibelle: string }>().perimetreLibelle).toBe(promo.libelle);
  });
});

describe('E-02-06 salles, affectations, E-02-07 et E-02-08', () => {
  let promo: DetailPromotion;

  beforeAll(async () => {
    const liste = (
      await requete('GET', `/api/promotions?etablissementId=${campusA}`, admin)
    ).json<ListePromotions>();
    const id = liste.promotions.find((p) => p.anneeFormation === 1)?.id ?? '';
    promo = (await requete('GET', `/api/promotions/${id}`, admin)).json<DetailPromotion>();
  });

  it('US-02-09 RG-02-19 décrit les salles ; la scolarité ne gère que son établissement', async () => {
    const creee = await requete('POST', '/api/salles', admin, {
      etablissementId: campusA,
      nom: 'Amphi Lumière',
      capacite: 120,
      type: 'amphitheatre',
      equipements: ['vidéoprojecteur', 'sonorisation'],
      pmr: true,
    });
    expect(creee.statusCode, creee.body).toBe(201);
    await requete('POST', '/api/salles', admin, {
      etablissementId: campusA,
      nom: 'Salle 12',
      capacite: 20,
    });
    const filtre = (
      await requete(
        'GET',
        `/api/salles?etablissementId=${campusA}&capaciteMin=50&equipement=sono`,
        admin,
      )
    ).json<ListeSalles>();
    expect(filtre.salles.map((x) => x.nom)).toEqual(['Amphi Lumière']);
    const scolariteB = await compte('scolarite', { type: 'etablissement', id: campusB });
    const refus = await requete('POST', '/api/salles', scolariteB, {
      etablissementId: campusA,
      nom: 'Intrus',
    });
    expect(refus.statusCode).toBe(403);
    const liste = (await requete('GET', '/api/salles', scolariteB)).json<ListeSalles>();
    expect(liste.salles.find((x) => x.nom === 'Amphi Lumière')?.modifiable).toBe(false);
    const fermee = await requete('PATCH', `/api/salles/${creee.json<Salle>().id}`, admin, {
      statut: 'fermee',
    });
    expect(fermee.json<Salle>().statut).toBe('fermee');
  });

  it('RG-02-19 un nouvel établissement a sa salle virtuelle', async () => {
    const reponse = await requete('POST', '/api/etablissements', admin, {
      nom: 'Campus C',
      adresseLigne1: '3 rue des Lilas',
      codePostal: '99300',
      ville: 'Lumerac',
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const campusC = reponse.json<{ id: string }>().id;
    const salles = (
      await requete('GET', `/api/salles?etablissementId=${campusC}`, admin)
    ).json<ListeSalles>();
    expect(salles.salles.map((x) => x.type)).toEqual(['virtuelle']);
  });

  it('US-02-08 RG-02-18 affecte un intervenant et signale les écarts avec la maquette', async () => {
    const intervenant = await compte('intervenant', { type: 'soi', id: null });
    const intervenantId = derniereFiche;
    const avant = (
      await requete('GET', `/api/promotions/${promo.id}/affectations`, admin)
    ).json<AffectationsPromotion>();
    const m1 = avant.modules.find((m) => m.code === 'M1');
    expect(m1?.ecarts).toEqual([]);
    await requete('PATCH', `/api/maquettes/${promo.version.id}/modules/${m1?.id ?? ''}`, admin, {
      heures: { cm: 20, td: 10 },
    });
    const creee = await requete('POST', `/api/promotions/${promo.id}/affectations`, admin, {
      personneId: intervenantId,
      moduleId: m1?.id,
      groupeIds: [promo.groupes[0]?.id],
      heures: { cm: 20, td: 12 },
    });
    expect(creee.statusCode, creee.body).toBe(201);
    const apres = (
      await requete('GET', `/api/promotions/${promo.id}/affectations`, admin)
    ).json<AffectationsPromotion>();
    expect(apres.modules.find((m) => m.code === 'M1')?.ecarts).toEqual([
      { type: 'td', prevu: 10, affecte: 12, ecart: 2 },
    ]);
    const horsMaquette = await requete('POST', `/api/promotions/${promo.id}/affectations`, admin, {
      personneId: intervenantId,
      moduleId: newId(),
    });
    expect(horsMaquette.statusCode).toBe(400);
    const scolarite = await compte('scolarite', { type: 'organisation', id: null });
    const refus = await requete('POST', `/api/promotions/${promo.id}/affectations`, scolarite, {
      personneId: intervenantId,
      moduleId: m1?.id,
    });
    expect(refus.statusCode).toBe(403);

    // E-02-08 : l'intervenant voit ses modules, groupes et heures, sans permission particulière.
    const mes = await requete('GET', '/api/moi/enseignements', intervenant);
    expect(mes.statusCode, mes.body).toBe(200);
    expect(mes.json<MesEnseignements>()).toMatchObject({
      totalHeures: 32,
      enseignements: [
        { module: { code: 'M1' }, groupes: [promo.groupes[0]?.libelle], realisees: null },
      ],
    });
  });

  it('US-02-10 l’apprenant consulte sa maquette et ses règles', async () => {
    const email = `apprenant.${newId()}@scolarite.test`;
    const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
      email,
      name: 'Fictif',
      password: PASSWORD,
    });
    const [fiche] = await owner.db
      .insert(personne)
      .values({
        organisationId: ecole,
        nom: 'Apprenant',
        prenom: 'Lou',
        email,
        userId,
        compteEtat: 'actif',
      })
      .returning();
    const [leRole] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'apprenant')));
    await owner.db.insert(attribution).values({
      organisationId: ecole,
      personneId: fiche?.id ?? '',
      roleId: leRole?.id ?? '',
      perimetreType: 'soi',
      debut: '2026-01-01',
    });
    await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: fiche?.id,
      statut: 'initial',
      option: 'anglais',
    });
    const cookie = await signInCookie(app, email, PASSWORD, { doubleAuthentification: false });
    const reponse = await requete('GET', '/api/moi/formation', cookie);
    expect(reponse.statusCode, reponse.body).toBe(200);
    const [suivie] = reponse.json<MaFormation>().formations;
    expect(suivie).toMatchObject({ option: 'anglais', promotion: { id: promo.id } });
    expect(suivie?.maquette.ues.map((u) => u.code)).toEqual(['UE1', 'UE2']);
    expect(suivie?.maquette).toMatchObject({ modifiable: false, publiable: false });
    expect(suivie?.maquette.versions).toHaveLength(1);
    expect((await requete('GET', `/api/promotions/${promo.id}`, cookie)).statusCode).toBe(403);
  });
});
