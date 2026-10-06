import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type EchelleMaitrise,
  type ElementCree,
  type Formation,
  type ListeFormations,
  type Maquette,
  type ResultatSimulation,
} from '@scolaly/contracts';
import {
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  formation,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  role,
} from '@scolaly/db';
import { REGLES_VALIDATION_PAR_DEFAUT } from '@scolaly/domain';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests du référentiel';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let campus: string;
let autreCampus: string;
let formationEtrangere: string;
const cookies = new Map<string, string>();

/** Compte de test avec un rôle par défaut, sur l'école ou sur un périmètre. */
async function compte(
  code: string,
  perimetre: { type: 'organisation' | 'etablissement' | 'formation'; id: string | null },
) {
  const email = `${code}.${newId()}@referentiel.test`;
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
      prenom: 'Sacha',
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
    perimetreId: perimetre.id,
    debut: '2026-01-01',
  });
  return signInCookie(app, email, PASSWORD, {
    doubleAuthentification: leRole?.doubleAuthentificationRequise ?? false,
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

const admin = () => cookies.get('admin') ?? '';

const BACHELOR = {
  intitule: 'Bachelor Gestion',
  type: 'bachelor',
  niveau: 6,
  codeRncp: ' rncp 35521 ',
  dureeAnnees: 3,
  modes: ['initial', 'apprentissage'],
};

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École du référentiel'],
    [autreEcole, 'Autre école du référentiel'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [local, deuxieme] = await owner.db
    .insert(etablissement)
    .values([
      { organisationId: ecole, nom: 'Campus du référentiel' },
      { organisationId: ecole, nom: 'Second campus' },
    ])
    .returning();
  campus = local?.id ?? '';
  autreCampus = deuxieme?.id ?? '';
  const [etrangere] = await owner.db
    .insert(formation)
    .values({
      organisationId: autreEcole,
      intitule: 'Formation d’une autre école',
      type: 'bts',
      niveau: 5,
      dureeAnnees: 2,
      modes: ['initial'],
    })
    .returning();
  formationEtrangere = etrangere?.id ?? '';
  cookies.set('admin', await compte('administrateur', { type: 'organisation', id: null }));
  cookies.set('scolarite', await compte('scolarite', { type: 'organisation', id: null }));
  cookies.set('direction', await compte('direction', { type: 'organisation', id: null }));
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('E-02-01 et E-02-02 formations et maquettes', () => {
  let bachelor: Formation;
  let v1: string;
  let maquette: Maquette;
  const ids = new Map<string, string>();

  const ajouter = async (type: string, corps: Record<string, unknown>, nom: string) => {
    const reponse = await requete('POST', `/api/maquettes/${v1}/${type}`, admin(), corps);
    expect(reponse.statusCode, reponse.body).toBe(201);
    const { id, maquette: m } = reponse.json<ElementCree>();
    ids.set(nom, id);
    maquette = m;
    return id;
  };

  it('US-02-01 RG-02-01 crée une formation et sa version 1 en brouillon, règles par défaut', async () => {
    const reponse = await requete('POST', '/api/formations', admin(), {
      ...BACHELOR,
      etablissementIds: [campus],
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    bachelor = reponse.json<Formation>();
    expect(bachelor).toMatchObject({
      intitule: 'Bachelor Gestion',
      codeRncp: 'RNCP35521',
      etablissementIds: [campus],
      modifiable: true,
      publiable: true,
      versions: [{ numero: 1, statut: 'brouillon', utilisee: false }],
    });
    v1 = bachelor.versions[0]?.id ?? '';
    const lu = await requete('GET', `/api/maquettes/${v1}`, admin());
    expect(lu.json<Maquette>().regles).toEqual(REGLES_VALIDATION_PAR_DEFAUT);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, bachelor.id), eq(auditEvenement.action, 'formation.creer')),
      );
    expect(trace?.apres).toMatchObject({ intitule: 'Bachelor Gestion' });
  });

  it('RG-02-01 refuse un niveau, un code RNCP ou un établissement invalides, avec le champ en cause', async () => {
    for (const [corps, champ] of [
      [{ ...BACHELOR, niveau: 4 }, 'niveau'],
      [{ ...BACHELOR, codeRncp: 'ABC12' }, 'codeRncp'],
      [{ ...BACHELOR, modes: [] }, 'modes'],
      [{ ...BACHELOR, etablissementIds: [newId()] }, 'etablissementIds'],
    ] as const) {
      const reponse = await requete('POST', '/api/formations', admin(), corps);
      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.json<{ details: string[] }>().details.join()).toContain(champ);
    }
  });

  it('RG-02-02 RG-02-03 construit l’arbre bloc → UE → modules, totaux et avertissements en direct', async () => {
    await ajouter('blocs', { code: 'BC1', intitule: 'Piloter une activité' }, 'bc1');
    await ajouter(
      'ues',
      {
        blocId: ids.get('bc1'),
        code: 'UE1',
        intitule: 'Gestion',
        semestre: 1,
        ects: 18,
        coefficient: 3,
      },
      'ue1',
    );
    await ajouter(
      'ues',
      { code: 'UE2', intitule: 'Langues', semestre: 1, ects: 12, coefficient: 2 },
      'ue2',
    );
    await ajouter(
      'ues',
      {
        blocId: ids.get('bc1'),
        code: 'UE3',
        intitule: 'Projet',
        semestre: 2,
        ects: 27,
        coefficient: 1,
      },
      'ue3',
    );
    await ajouter(
      'modules',
      { ueId: ids.get('ue1'), code: 'M1', intitule: 'Comptabilité', heures: { cm: 20, td: 10.5 } },
      'm1',
    );
    await ajouter(
      'modules',
      { ueId: ids.get('ue1'), code: 'M2', intitule: 'Finance', coefficient: 2, heures: { td: 15 } },
      'm2',
    );
    await ajouter(
      'modules',
      { ueId: ids.get('ue2'), code: 'M3', intitule: 'Anglais', heures: { td: 24 } },
      'm3',
    );
    expect(maquette.totaux).toMatchObject({ heuresTotal: 69.5, ects: 57 });
    expect(maquette.totaux.periodes.map((p) => [p.semestre, p.ects])).toEqual([
      [1, 30],
      [2, 27],
    ]);
    expect(maquette.avertissements).toEqual([
      { type: 'semestre-ects', annee: 1, semestre: 2, ects: 27, attendu: 30 },
      { type: 'ue-sans-module', ueId: ids.get('ue3'), code: 'UE3' },
    ]);
    await ajouter(
      'modules',
      { ueId: ids.get('ue3'), code: 'M4', intitule: 'Projet tutoré', heures: { projet: 40 } },
      'm4',
    );
    const corrige = await requete(
      'PATCH',
      `/api/maquettes/${v1}/ues/${ids.get('ue3') ?? ''}`,
      admin(),
      { ects: 30 },
    );
    expect(corrige.json<Maquette>().avertissements).toEqual([]);
  });

  it('refuse un parent d’une autre version, une année hors durée et un élément inconnu', async () => {
    const annee = await requete('POST', `/api/maquettes/${v1}/ues`, admin(), {
      code: 'UE9',
      intitule: 'Trop loin',
      annee: 4,
    });
    expect(annee.statusCode).toBe(400);
    const parent = await requete('POST', `/api/maquettes/${v1}/modules`, admin(), {
      ueId: newId(),
      code: 'X',
      intitule: 'X',
    });
    expect(parent.statusCode).toBe(400);
    const inconnu = await requete('PATCH', `/api/maquettes/${v1}/modules/${newId()}`, admin(), {
      intitule: 'X',
    });
    expect(inconnu.statusCode).toBe(404);
  });

  it('réordonne les modules d’une UE (glisser-déposer)', async () => {
    const reponse = await requete(
      'PATCH',
      `/api/maquettes/${v1}/modules/${ids.get('m2') ?? ''}`,
      admin(),
      { ordre: 0 },
    );
    const ue1 = reponse.json<Maquette>().modules.filter((m) => m.ueId === ids.get('ue1'));
    expect(ue1.map((m) => [m.code, m.ordre])).toEqual([
      ['M2', 0],
      ['M1', 1],
    ]);
  });

  it('RG-02-21 RG-02-23 décrit les compétences d’un bloc et les rattache aux modules', async () => {
    await ajouter(
      'competences',
      {
        blocId: ids.get('bc1'),
        code: 'C1.1',
        intitule: 'Établir un budget',
        criteres: ['Budget équilibré'],
        moduleIds: [ids.get('m1'), ids.get('m2')],
      },
      'c1',
    );
    await ajouter(
      'competences',
      {
        blocId: ids.get('bc1'),
        code: 'C1.2',
        intitule: 'Conduire un projet',
        moduleIds: [ids.get('m4')],
      },
      'c2',
    );
    expect(maquette.competences.map((c) => [c.code, c.moduleIds.length])).toEqual([
      ['C1.1', 2],
      ['C1.2', 1],
    ]);
    const bloc = await requete(
      'DELETE',
      `/api/maquettes/${v1}/blocs/${ids.get('bc1') ?? ''}`,
      admin(),
    );
    expect(bloc.statusCode).toBe(409);
  });

  it('RG-02-07 à RG-02-10 paramètre les règles et simule les résultats', async () => {
    const incoherent = await requete('PUT', `/api/maquettes/${v1}/regles`, admin(), {
      regles: { ...REGLES_VALIDATION_PAR_DEFAUT, modeEvaluation: 'competences' },
      reglesParticulieres: [],
    });
    expect(incoherent.statusCode).toBe(400);
    const cibleInconnue = await requete('PUT', `/api/maquettes/${v1}/regles`, admin(), {
      regles: REGLES_VALIDATION_PAR_DEFAUT,
      reglesParticulieres: [
        {
          regleId: null,
          libelle: 'Sport',
          regle: {
            type: 'ue_bonus',
            source: { niveau: 'ue', id: newId() },
            seuil: 10,
            diviseur: 20,
            cible: { niveau: 'generale' },
          },
        },
      ],
    });
    expect(cibleInconnue.statusCode).toBe(400);
    const regles = await requete('PUT', `/api/maquettes/${v1}/regles`, admin(), {
      regles: { ...REGLES_VALIDATION_PAR_DEFAUT, noteEliminatoire: 6 },
      reglesParticulieres: [
        {
          regleId: null,
          libelle: 'Bonus engagement',
          regle: {
            type: 'bonus',
            valeur: 0.5,
            unite: 'points',
            cible: { niveau: 'generale' },
            plafond: null,
            automatique: false,
          },
        },
      ],
    });
    expect(regles.statusCode, regles.body).toBe(200);
    maquette = regles.json<Maquette>();
    const bonus = maquette.reglesParticulieres[0]?.id ?? '';
    const note = (moduleId: string | undefined, valeur: number) => ({ moduleId, note: valeur });
    const simulation = await requete('POST', `/api/maquettes/${v1}/simulation`, admin(), {
      evaluations: [
        note(ids.get('m1'), 12),
        note(ids.get('m2'), 12),
        note(ids.get('m3'), 8),
        note(ids.get('m4'), 11),
      ],
      bonusAccordes: [bonus],
    });
    expect(simulation.statusCode, simulation.body).toBe(200);
    const resultat = simulation.json<ResultatSimulation>();
    expect(resultat).toMatchObject({ admis: true, ects: 60, moyenneGenerale: 11 });
    expect(resultat.ues.find((u) => u.id === ids.get('ue2'))).toMatchObject({
      acquise: true,
      par: 'compensation',
    });
    expect(resultat.explications).toEqual([
      expect.objectContaining({ libelle: 'Bonus engagement', avant: 10.5, apres: 11 }),
    ]);
  });

  it('RG-02-04 publie, corrige un libellé avec une trace, et crée une nouvelle version complète', async () => {
    const publication = await requete('POST', `/api/maquettes/${v1}/publication`, admin());
    expect(publication.statusCode, publication.body).toBe(200);
    expect(publication.json<Maquette>().version).toMatchObject({ statut: 'publiee' });
    expect((await requete('POST', `/api/maquettes/${v1}/publication`, admin())).statusCode).toBe(
      409,
    );

    const libelle = await requete(
      'PATCH',
      `/api/maquettes/${v1}/modules/${ids.get('m1') ?? ''}`,
      admin(),
      { intitule: 'Comptabilité générale' },
    );
    expect(libelle.statusCode).toBe(200);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.objetId, v1), eq(auditEvenement.action, 'maquette.module.modifier')),
      )
      .orderBy(desc(auditEvenement.id));
    expect(trace?.apres).toMatchObject({ correctionApresPublication: true, version: 1 });

    const copie = await requete('POST', `/api/maquettes/${v1}/nouvelle-version`, admin());
    expect(copie.statusCode, copie.body).toBe(201);
    const v2 = copie.json<Maquette>();
    expect(v2.version).toMatchObject({ numero: 2, statut: 'brouillon' });
    expect(v2.modules.map((m) => m.code).sort()).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(v2.modules.some((m) => m.id === ids.get('m1'))).toBe(false);
    expect(v2.competences.find((c) => c.code === 'C1.1')?.moduleIds).toHaveLength(2);
    expect(v2.regles.noteEliminatoire).toBe(6);
    expect(v2.reglesParticulieres.map((r) => r.libelle)).toEqual(['Bonus engagement']);
    expect(v2.versions.map((v) => [v.numero, v.statut])).toEqual([
      [1, 'publiee'],
      [2, 'brouillon'],
    ]);
  });

  it('une version archivée est en lecture seule', async () => {
    const archivage = await requete('POST', `/api/maquettes/${v1}/archivage`, admin());
    expect(archivage.statusCode).toBe(200);
    const refus = await requete(
      'PATCH',
      `/api/maquettes/${v1}/ues/${ids.get('ue1') ?? ''}`,
      admin(),
      { intitule: 'Nouveau' },
    );
    expect(refus.statusCode).toBe(409);
    expect(refus.json<{ message: string }>().message).toContain('archivée');
  });

  it('US-02-04 RG-02-20 duplique la formation avec sa dernière version, en brouillon', async () => {
    const reponse = await requete('POST', `/api/formations/${bachelor.id}/duplication`, admin(), {
      intitule: 'Bachelor Gestion 2027',
    });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const copie = reponse.json<Formation>();
    expect(copie).toMatchObject({
      intitule: 'Bachelor Gestion 2027',
      etablissementIds: [campus],
      versions: [{ numero: 1, statut: 'brouillon' }],
    });
    const arbre = (
      await requete('GET', `/api/maquettes/${copie.versions[0]?.id ?? ''}`, admin())
    ).json<Maquette>();
    expect(arbre.ues).toHaveLength(3);
  });

  it('E-02-01 filtre le catalogue par type, mode et établissement', async () => {
    const tous = (await requete('GET', '/api/formations', admin())).json<ListeFormations>();
    expect(tous.formations.map((f) => f.intitule)).toEqual([
      'Bachelor Gestion',
      'Bachelor Gestion 2027',
    ]);
    expect(tous.creation).toBe(true);
    for (const [filtre, attendu] of [
      ['type=master', 0],
      ['mode=apprentissage', 2],
      [`etablissementId=${autreCampus}`, 0],
      ['niveau=6', 2],
    ] as const) {
      const liste = (
        await requete('GET', `/api/formations?${filtre}`, admin())
      ).json<ListeFormations>();
      expect(liste.formations, filtre).toHaveLength(attendu);
    }
  });

  it('section 2 : scolarité et direction lisent sans modifier ; une autre école reste invisible', async () => {
    for (const nom of ['scolarite', 'direction']) {
      const cookie = cookies.get(nom) ?? '';
      const liste = (await requete('GET', '/api/formations', cookie)).json<ListeFormations>();
      expect(liste.formations.every((f) => !f.modifiable)).toBe(true);
      expect(liste.creation).toBe(false);
      expect(
        (await requete('PATCH', `/api/formations/${bachelor.id}`, cookie, { intitule: 'X' }))
          .statusCode,
      ).toBe(403);
    }
    expect(
      (await requete('GET', `/api/formations/${formationEtrangere}`, admin())).statusCode,
    ).toBe(404);
  });

  it('RG-00-10 un responsable pédagogique n’agit que sur ses formations', async () => {
    const responsable = await compte('responsable-pedagogique', {
      type: 'formation',
      id: bachelor.id,
    });
    const liste = (await requete('GET', '/api/formations', responsable)).json<ListeFormations>();
    expect(liste.formations.map((f) => f.id)).toEqual([bachelor.id]);
    expect(liste.creation).toBe(false);
    const autre = (await requete('GET', '/api/formations', admin()))
      .json<ListeFormations>()
      .formations.find((f) => f.id !== bachelor.id);
    expect(
      (await requete('GET', `/api/formations/${autre?.id ?? ''}`, responsable)).statusCode,
    ).toBe(404);
    expect((await requete('POST', '/api/formations', responsable, BACHELOR)).statusCode).toBe(403);
    const modification = await requete('PATCH', `/api/formations/${bachelor.id}`, responsable, {
      statut: 'archivee',
    });
    expect(modification.statusCode).toBe(200);
    expect(modification.json<Formation>().statut).toBe('archivee');
  });

  it('RG-00-10 un périmètre établissement couvre les formations qui y sont dispensées', async () => {
    const responsable = await compte('responsable-pedagogique', {
      type: 'etablissement',
      id: autreCampus,
    });
    expect(
      (await requete('GET', '/api/formations', responsable)).json<ListeFormations>().formations,
    ).toEqual([]);
    const hors = await requete('POST', '/api/formations', responsable, {
      ...BACHELOR,
      etablissementIds: [campus],
    });
    expect(hors.statusCode).toBe(403);
    const creee = await requete('POST', '/api/formations', responsable, {
      ...BACHELOR,
      intitule: 'BTS du second campus',
      etablissementIds: [autreCampus],
    });
    expect(creee.statusCode).toBe(201);
  });

  it('RG-01-14 attribue un rôle sur le périmètre d’une formation', async () => {
    const [fiche] = await owner.db
      .insert(personne)
      .values({
        organisationId: ecole,
        nom: 'Fictif',
        prenom: 'Lou',
        email: `lou.${newId()}@referentiel.test`,
      })
      .returning();
    const [leRole] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'responsable-pedagogique')));
    const reponse = await requete(
      'POST',
      `/api/personnes/${fiche?.id ?? ''}/attributions`,
      admin(),
      {
        roleId: leRole?.id,
        perimetreType: 'formation',
        perimetreId: bachelor.id,
      },
    );
    expect(reponse.statusCode, reponse.body).toBe(201);
    expect(reponse.json<{ perimetreLibelle: string }>().perimetreLibelle).toBe('Bachelor Gestion');
  });
});

describe('E-02-10 règles de l’école', () => {
  it('RG-02-22 propose l’échelle par défaut, puis enregistre celle de l’école', async () => {
    const parDefaut = (
      await requete('GET', '/api/referentiel/echelle', admin())
    ).json<EchelleMaitrise>();
    expect(parDefaut.parDefaut).toBe(true);
    expect(parDefaut.niveaux.map((n) => [n.libelle, n.valide])).toEqual([
      ['Non acquis', false],
      ['En cours d’acquisition', false],
      ['Acquis', true],
      ['Expert', true],
    ]);
    const saisie = {
      niveaux: [
        { libelle: 'Insuffisant', couleur: '#dc2626', valeur: 0, valide: false },
        { libelle: 'Maîtrisé', couleur: '#16a34a', valeur: 1, valide: true },
      ],
    };
    const refus = await requete(
      'PUT',
      '/api/referentiel/echelle',
      cookies.get('scolarite') ?? '',
      saisie,
    );
    expect(refus.statusCode).toBe(403);
    const sansValide = await requete('PUT', '/api/referentiel/echelle', admin(), {
      niveaux: saisie.niveaux.map((n) => ({ ...n, valide: false })),
    });
    expect(sansValide.statusCode).toBe(400);
    const echelle = (
      await requete('PUT', '/api/referentiel/echelle', admin(), saisie)
    ).json<EchelleMaitrise>();
    expect(echelle).toMatchObject({
      parDefaut: false,
      niveaux: [
        { libelle: 'Insuffisant', couleur: '#DC2626', ordre: 1 },
        { libelle: 'Maîtrisé', ordre: 2 },
      ],
    });
  });

  it('RG-02-26 gère la bibliothèque des règles particulières', async () => {
    const regle = {
      libelle: 'Rattrapage plafonné',
      regle: { type: 'plafond', typeEvaluation: 'rattrapage', sens: 'plafond', valeur: 10 },
    };
    const creee = await requete('POST', '/api/referentiel/regles', admin(), regle);
    expect(creee.statusCode, creee.body).toBe(201);
    const id = creee.json<{ id: string }>().id;
    const modifiee = await requete('PUT', `/api/referentiel/regles/${id}`, admin(), {
      ...regle,
      libelle: 'Rattrapage à 10',
    });
    expect(modifiee.json<{ libelle: string }>().libelle).toBe('Rattrapage à 10');
    const lecture = await requete('GET', '/api/referentiel/regles', cookies.get('direction') ?? '');
    expect(lecture.json<{ regles: unknown[] }>().regles).toHaveLength(1);
    expect((await requete('DELETE', `/api/referentiel/regles/${id}`, admin())).statusCode).toBe(
      204,
    );
    expect(
      (await requete('GET', '/api/referentiel/regles', admin())).json<{ regles: unknown[] }>()
        .regles,
    ).toEqual([]);
  });
});
