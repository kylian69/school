import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ROLES_PAR_DEFAUT,
  type ApercuSerie,
  type DetailPromotion,
  type ElementCree,
  type Formation,
  type Groupe,
  type Inscription,
  type ResultatSeances,
  type ResultatVerification,
  type Salle,
  type Seance,
  type SemaineEdt,
  type SerieCreee,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  auditEvenement,
  createDatabase,
  etablissement,
  fermeture,
  initialiserRolesParDefaut,
  newId,
  organisation,
  personne,
  presence,
  role,
  seance,
  seanceIntervenant,
} from '@scolaly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de l’emploi du temps';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
const autreEcole = newId();
let admin: string;
let scolarite: string;
let campusId: string;
let promo: DetailPromotion;
let groupe: Groupe;
let moduleId: string;
let intervenantId: string;
let coIntervenantId: string;
const salles: Record<'grande' | 'petite' | 'amphi', Salle> = {} as never;
const inscriptions: Inscription[] = [];

async function compte(code: string, organisationId = ecole) {
  const email = `${code}.${newId()}@edt.test`;
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
  return signInCookie(app, email, PASSWORD);
}

const requete = (
  method: 'GET' | 'POST' | 'PATCH',
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

const audits = (objetId: string) =>
  owner.db
    .select()
    .from(auditEvenement)
    .where(and(eq(auditEvenement.organisationId, ecole), eq(auditEvenement.objetId, objetId)));

const codes = (s: { conflits: { code: string }[] }) => s.conflits.map((c) => c.code).sort();

beforeAll(async () => {
  app = await startApp();
  for (const [id, nom] of [
    [ecole, 'École de l’emploi du temps'],
    [autreEcole, 'Autre école de l’emploi du temps'],
  ] as const) {
    await owner.db.insert(organisation).values({ id, nom, nomAffichage: nom.slice(0, 3) });
    await initialiserRolesParDefaut(owner.db, id, ROLES_PAR_DEFAUT);
  }
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus de l’emploi du temps' })
    .returning();
  campusId = campus?.id ?? '';
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
  scolarite = await compte('scolarite');
  const formation = (
    await requete('POST', '/api/formations', admin, {
      intitule: 'BTS Emploi du temps fictif',
      type: 'bts',
      niveau: 5,
      dureeAnnees: 2,
      modes: ['initial'],
      etablissementIds: [campusId],
    })
  ).json<Formation>();
  const version = formation.versions[0]?.id ?? '';
  const ue = (
    await requete('POST', `/api/maquettes/${version}/ues`, admin, {
      code: 'UE1',
      intitule: 'Atelier',
      ects: 30,
    })
  ).json<ElementCree>();
  moduleId = (
    await requete('POST', `/api/maquettes/${version}/modules`, admin, {
      ueId: ue.id,
      code: 'M1',
      intitule: 'Algorithmique fictive',
      heures: { cm: 10, td: 2 },
    })
  ).json<ElementCree>().id;
  await requete('POST', `/api/maquettes/${version}/publication`, admin);
  promo = (
    await requete('POST', '/api/promotions', admin, {
      formationId: formation.id,
      anneeFormation: 1,
      anneeScolaireId: annee?.id,
      etablissementId: campusId,
    })
  ).json<DetailPromotion>();
  const fiches = await owner.db
    .insert(personne)
    .values(
      ['Arnaud', 'Barbier', 'Intervenant', 'Coanimateur'].map((nom) => ({
        organisationId: ecole,
        nom,
        prenom: 'Sacha',
        email: `${nom.toLowerCase()}.${newId()}@edt.test`,
      })),
    )
    .returning();
  intervenantId = fiches[2]?.id ?? '';
  coIntervenantId = fiches[3]?.id ?? '';
  for (const fiche of fiches.slice(0, 2)) {
    const reponse = await requete('POST', `/api/promotions/${promo.id}/inscriptions`, admin, {
      personneId: fiche.id,
      statut: 'initial',
      dateEntree: '2026-09-01',
    });
    inscriptions.push(reponse.json<Inscription>());
  }
  groupe = (
    await requete('POST', `/api/promotions/${promo.id}/groupes`, admin, {
      libelle: 'TD A',
      type: 'td',
    })
  ).json<Groupe>();
  await requete('POST', `/api/groupes/${groupe.id}/membres`, admin, {
    inscriptionIds: [inscriptions[0]?.id],
    date: '2026-09-01',
  });
  for (const [cle, nom, capacite, type] of [
    ['grande', 'Salle 101', 30, 'cours'],
    ['petite', 'Box 1', 1, 'cours'],
    ['amphi', 'Amphi A', 40, 'amphitheatre'],
  ] as const) {
    salles[cle] = (
      await requete('POST', '/api/salles', admin, {
        etablissementId: campusId,
        nom,
        capacite,
        type,
      })
    ).json<Salle>();
  }
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

/** Lundi 2 novembre 2026, heure de Paris (UTC+1). */
const seanceTd = {
  type: 'td',
  moduleId: undefined as string | undefined,
  groupeIds: [] as string[],
  debut: '2026-11-02T08:00:00Z',
  fin: '2026-11-02T10:00:00Z',
};
let s1: Seance;
let s2: Seance;

describe('RG-04-01 création d’une séance en brouillon', () => {
  it('crée la séance d’un module en brouillon, avec son public, et la trace', async () => {
    const reponse = await requete('POST', '/api/edt/seances', admin, {
      ...seanceTd,
      moduleId,
      groupeIds: [groupe.id],
      salleId: salles.grande.id,
      intervenantIds: [intervenantId],
    });
    expect(reponse.statusCode).toBe(201);
    s1 = reponse.json<Seance>();
    expect(s1).toMatchObject({
      statut: 'brouillon',
      libelle: 'Algorithmique fictive',
      groupeIds: [groupe.id],
      modifiable: true,
    });
    expect(s1.conflits).toEqual([]);
    expect((await audits(s1.id)).map((a) => a.action)).toContain('seance.creer');
  });

  it('exige un public, et un module ou une activité, au pas de 15 minutes', async () => {
    const sansPublic = await requete('POST', '/api/edt/seances', admin, { ...seanceTd, moduleId });
    expect(sansPublic.statusCode).toBe(400);
    const lesDeux = await requete('POST', '/api/edt/seances', admin, {
      ...seanceTd,
      moduleId,
      activite: 'Réunion',
      groupeIds: [groupe.id],
    });
    expect(lesDeux.statusCode).toBe(400);
    const horsPas = await requete('POST', '/api/edt/seances', admin, {
      ...seanceTd,
      moduleId,
      groupeIds: [groupe.id],
      debut: '2026-11-02T08:05:00Z',
    });
    expect(horsPas.statusCode).toBe(400);
    expect(horsPas.json<{ details: string[] }>().details[0]).toContain('15 minutes');
  });

  it('est réservée à la pédagogie et à la scolarité', async () => {
    const intervenant = await compte('intervenant');
    const reponse = await requete('POST', '/api/edt/seances', intervenant, {
      ...seanceTd,
      moduleId,
      groupeIds: [groupe.id],
    });
    expect(reponse.statusCode).toBe(403);
  });
});

describe('RG-04-05 conflits', () => {
  it('signale salle, intervenant et groupe occupés, mais enregistre le brouillon', async () => {
    const reponse = await requete('POST', '/api/edt/seances', scolarite, {
      ...seanceTd,
      type: 'projet',
      activite: 'Réunion de rentrée',
      promotionIds: [promo.id],
      salleId: salles.grande.id,
      intervenantIds: [intervenantId],
      debut: '2026-11-02T09:00:00Z',
      fin: '2026-11-02T11:00:00Z',
    });
    expect(reponse.statusCode).toBe(201);
    s2 = reponse.json<Seance>();
    expect(s2.statut).toBe('brouillon');
    expect(codes(s2)).toEqual(['groupe-occupe', 'intervenant-occupe', 'salle-occupee']);
    const groupeOccupe = s2.conflits.find((c) => c.code === 'groupe-occupe');
    expect(groupeOccupe).toMatchObject({
      seanceId: s1.id,
      apprenantIds: [inscriptions[0]?.personne.id],
    });
  });

  it('signale un jour férié comme bloquant et une salle trop petite en avertissement', async () => {
    const reponse = await requete('POST', '/api/edt/seances', admin, {
      ...seanceTd,
      moduleId,
      promotionIds: [promo.id],
      salleId: salles.petite.id,
      debut: '2026-11-11T08:00:00Z',
      fin: '2026-11-11T09:00:00Z',
    });
    expect(reponse.statusCode).toBe(201);
    const seance = reponse.json<Seance>();
    expect(seance.conflits).toEqual(
      expect.arrayContaining([
        { code: 'jour-ferme', niveau: 'bloquant', jours: ['2026-11-11'] },
        { code: 'capacite-salle', niveau: 'avertissement', capacite: 1, effectif: 2 },
      ]),
    );
  });

  it('lit la semaine de l’établissement avec ses conflits, filtrable par groupe', async () => {
    const url = `/api/edt/semaine?etablissementId=${campusId}&debut=2026-11-02`;
    const semaine = (await requete('GET', url, scolarite)).json<SemaineEdt>();
    expect(semaine).toMatchObject({ debut: '2026-11-02', fin: '2026-11-08', creation: true });
    expect(semaine.seances.map((s) => s.id)).toEqual(expect.arrayContaining([s1.id, s2.id]));
    expect(codes(semaine.seances.find((s) => s.id === s1.id) ?? { conflits: [] })).toEqual([
      'groupe-occupe',
      'intervenant-occupe',
      'salle-occupee',
    ]);
    const parGroupe = (
      await requete('GET', `${url}&groupeId=${groupe.id}`, scolarite)
    ).json<SemaineEdt>();
    expect(parGroupe.seances.map((s) => s.id)).toEqual([s1.id]);
    const apprenant = await compte('apprenant');
    expect((await requete('GET', url, apprenant)).statusCode).toBe(403);
    const ailleurs = await compte('administrateur', autreEcole);
    expect((await requete('GET', url, ailleurs)).statusCode).toBe(404);
  });
});

describe('RG-04-07 solutions proposées', () => {
  it('propose des salles libres assez grandes et des créneaux libres proches', async () => {
    const reponse = await requete('POST', '/api/edt/verification', scolarite, {
      ...seanceTd,
      moduleId,
      groupeIds: [groupe.id],
      salleId: salles.grande.id,
      intervenantIds: [intervenantId],
    });
    expect(reponse.statusCode).toBe(200);
    const resultat = reponse.json<ResultatVerification>();
    expect(codes(resultat)).toContain('salle-occupee');
    expect(resultat.sallesLibres.map((s) => s.nom)).toEqual(['Box 1', 'Amphi A']);
    expect(resultat.creneauxLibres.length).toBeGreaterThan(0);
    for (const c of resultat.creneauxLibres) {
      const libre = c.fin <= '2026-11-02T08:00:00.000Z' || c.debut >= '2026-11-02T11:00:00.000Z';
      expect(libre).toBe(true);
    }
  });

  it('RG-04-02 propose les créneaux et affiche la grille dans la plage de l’établissement', async () => {
    await owner.db
      .update(etablissement)
      .set({ edtDebut: '13:00', edtFin: '18:00', edtLimiteMidi: '15:00', edtJoursOuvres: [4] })
      .where(eq(etablissement.id, campusId));
    try {
      const semaine = (
        await requete(
          'GET',
          `/api/edt/semaine?etablissementId=${campusId}&debut=2026-11-02`,
          scolarite,
        )
      ).json<SemaineEdt>();
      expect(semaine.plage).toEqual({
        debut: '13:00',
        fin: '18:00',
        limiteMidi: '15:00',
        joursOuvres: [4],
      });
      const verification = {
        ...seanceTd,
        moduleId,
        groupeIds: [groupe.id],
        salleId: salles.grande.id,
        intervenantIds: [intervenantId],
      };
      const resultat = (
        await requete('POST', '/api/edt/verification', scolarite, verification)
      ).json<ResultatVerification>();
      expect(resultat.creneauxLibres.length).toBeGreaterThan(0);
      for (const c of resultat.creneauxLibres) {
        // Novembre : Paris = UTC+1, jeudi seulement, entre 13 h et 18 h locales.
        expect(new Date(c.debut).getUTCDay()).toBe(4);
        expect(c.debut.slice(11, 16) >= '12:00' && c.fin.slice(11, 16) <= '17:00').toBe(true);
      }
      // Une plage fournie par la requête l'emporte sur celle de l'établissement.
      const imposee = (
        await requete('POST', '/api/edt/verification', scolarite, {
          ...verification,
          joursOuverts: [5],
        })
      ).json<ResultatVerification>();
      for (const c of imposee.creneauxLibres) expect(new Date(c.debut).getUTCDay()).toBe(5);
    } finally {
      await owner.db
        .update(etablissement)
        .set({
          edtDebut: '08:00',
          edtFin: '19:00',
          edtLimiteMidi: '13:00',
          edtJoursOuvres: [1, 2, 3, 4, 5],
        })
        .where(eq(etablissement.id, campusId));
    }
  });
});

describe('RG-04-06 publication et forçage', () => {
  it('refuse de publier une séance en conflit bloquant', async () => {
    const reponse = await requete('POST', '/api/edt/publication', admin, {
      seanceIds: [s1.id, s2.id],
    });
    expect(reponse.statusCode).toBe(409);
    expect(reponse.json<{ message: string }>().message).toContain('conflits bloquants');
  });

  it('réserve le forçage à un responsable et ne force qu’un conflit existant', async () => {
    const forcage = { code: 'salle-occupee', seanceId: s1.id, motif: 'Cours commun' };
    const parScolarite = await requete('PATCH', `/api/edt/seances/${s2.id}`, scolarite, {
      forcages: [forcage],
    });
    expect(parScolarite.statusCode).toBe(403);
    const inexistant = await requete('PATCH', `/api/edt/seances/${s2.id}`, admin, {
      forcages: [{ ...forcage, seanceId: newId() }],
    });
    expect(inexistant.statusCode).toBe(400);
    const sansMotif = await requete('PATCH', `/api/edt/seances/${s2.id}`, admin, {
      forcages: [{ ...forcage, motif: ' ' }],
    });
    expect(sansMotif.statusCode).toBe(400);
  });

  it('trace le forçage avant et après, puis publie quand rien de bloquant ne reste', async () => {
    const motif = 'Réunion commune à toute la promotion';
    const reponse = await requete('PATCH', `/api/edt/seances/${s2.id}`, admin, {
      intervenantIds: [],
      forcages: [
        { code: 'salle-occupee', seanceId: s1.id, motif },
        { code: 'groupe-occupe', seanceId: s1.id, motif },
      ],
    });
    expect(reponse.statusCode).toBe(200);
    s2 = reponse.json<ResultatSeances>().seances[0] as Seance;
    expect(s2.forcages).toHaveLength(2);
    const trace = (await audits(s2.id)).find((a) => a.action === 'seance.conflit.forcer');
    expect(trace?.avant).toMatchObject({ conflit: { code: 'salle-occupee', seanceId: s1.id } });
    expect(trace?.apres).toMatchObject({ forcage: { code: 'salle-occupee', motif } });
    // La première séance porte le même conflit, vu de son côté.
    await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      forcages: [
        { code: 'salle-occupee', seanceId: s2.id, motif },
        { code: 'groupe-occupe', seanceId: s2.id, motif },
      ],
    });
    const publication = await requete('POST', '/api/edt/publication', scolarite, {
      seanceIds: [s1.id, s2.id],
    });
    expect(publication.statusCode).toBe(200);
    expect(publication.json<ResultatSeances>().seances.map((s) => s.statut)).toEqual([
      'publiee',
      'publiee',
    ]);
    expect((await audits(s1.id)).map((a) => a.action)).toContain('seance.publier');
  });

  it('refuse une modification qui rend bloquante une séance publiée', async () => {
    const reponse = await requete('PATCH', `/api/edt/seances/${s2.id}`, admin, {
      intervenantIds: [intervenantId],
    });
    expect(reponse.statusCode).toBe(409);
  });
});

describe('RG-04-03 séries', () => {
  const serie = {
    type: 'cm',
    groupeIds: [] as string[],
    dateDebut: '2026-10-13',
    dateFin: '2026-11-10',
    joursSemaine: [2],
    heureDebut: '09:00',
    heureFin: '11:00',
    joursExclus: ['2026-11-03'],
  };
  let creee: SerieCreee;

  it('saute les jours fermés et exclus dans l’aperçu', async () => {
    const reponse = await requete('POST', '/api/edt/series/apercu', admin, {
      ...serie,
      moduleId,
      groupeIds: [groupe.id],
    });
    expect(reponse.statusCode).toBe(200);
    const apercu = reponse.json<ApercuSerie>();
    expect(apercu.occurrences).toEqual([
      { jour: '2026-10-13', debut: '2026-10-13T07:00:00.000Z', fin: '2026-10-13T09:00:00.000Z' },
      { jour: '2026-11-10', debut: '2026-11-10T08:00:00.000Z', fin: '2026-11-10T10:00:00.000Z' },
    ]);
    expect(apercu.sautees).toEqual([
      { jour: '2026-10-20', raison: 'fermeture' },
      { jour: '2026-10-27', raison: 'fermeture' },
      { jour: '2026-11-03', raison: 'exclu' },
    ]);
  });

  it('crée les séances de la série en brouillon et la trace', async () => {
    const reponse = await requete('POST', '/api/edt/series', admin, {
      ...serie,
      moduleId,
      groupeIds: [groupe.id],
      salleId: salles.amphi.id,
      intervenantIds: [coIntervenantId, intervenantId],
    });
    expect(reponse.statusCode).toBe(201);
    creee = reponse.json<SerieCreee>();
    expect(creee.seances.map((s) => [s.statut, s.serieId])).toEqual([
      ['brouillon', creee.serieId],
      ['brouillon', creee.serieId],
    ]);
    const deux = [coIntervenantId, intervenantId].sort();
    expect(creee.seances.map((s) => s.intervenantIds)).toEqual([deux, deux]);
    expect((await audits(creee.serieId)).map((a) => a.action)).toEqual(['seance.serie.creer']);
  });

  it('modifie cette séance et les suivantes, sans en changer l’horaire', async () => {
    const [premiere, seconde] = creee.seances as [Seance, Seance];
    const decalage = await requete('PATCH', `/api/edt/seances/${premiere.id}`, admin, {
      portee: 'serie',
      debut: '2026-10-13T08:00:00Z',
    });
    expect(decalage.statusCode).toBe(400);
    const reponse = await requete('PATCH', `/api/edt/seances/${seconde.id}`, admin, {
      portee: 'suivantes',
      salleId: salles.grande.id,
    });
    expect(reponse.json<ResultatSeances>().seances.map((s) => s.id)).toEqual([seconde.id]);
    const toute = await requete('PATCH', `/api/edt/seances/${premiere.id}`, admin, {
      portee: 'serie',
      type: 'td',
    });
    expect(toute.json<ResultatSeances>().seances.map((s) => [s.type, s.salleId])).toEqual([
      ['td', salles.amphi.id],
      ['td', salles.grande.id],
    ]);
  });

  it('RG-04-04 annule toute la série avec un motif ; une séance annulée ne se modifie plus', async () => {
    const [premiere] = creee.seances as [Seance];
    const sansMotif = await requete('POST', `/api/edt/seances/${premiere.id}/annulation`, admin, {
      motif: '',
    });
    expect(sansMotif.statusCode).toBe(400);
    const reponse = await requete('POST', `/api/edt/seances/${premiere.id}/annulation`, admin, {
      motif: 'Intervenant indisponible',
      portee: 'serie',
    });
    expect(reponse.statusCode).toBe(200);
    expect(
      reponse.json<ResultatSeances>().seances.map((s) => [s.statut, s.motifAnnulation]),
    ).toEqual([
      ['annulee', 'Intervenant indisponible'],
      ['annulee', 'Intervenant indisponible'],
    ]);
    const modification = await requete('PATCH', `/api/edt/seances/${premiere.id}`, admin, {
      salleId: null,
    });
    expect(modification.statusCode).toBe(409);
  });
});

describe('RG-04-01 plusieurs intervenants', () => {
  it('compte chaque intervenant dans les conflits', async () => {
    const reponse = await requete('POST', '/api/edt/verification', scolarite, {
      ...seanceTd,
      activite: 'Jury fictif',
      type: 'examen',
      groupeIds: [groupe.id],
      intervenantIds: [coIntervenantId, intervenantId],
    });
    expect(reponse.statusCode).toBe(200);
    const occupe = reponse
      .json<ResultatVerification>()
      .conflits.find((c) => c.code === 'intervenant-occupe');
    expect(occupe).toMatchObject({ seanceId: s1.id, intervenantIds: [intervenantId] });
  });

  it('ajoute et retire un intervenant, avec la trace avant et après', async () => {
    const ajout = await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      intervenantIds: [intervenantId, coIntervenantId],
    });
    expect(ajout.statusCode).toBe(200);
    expect(ajout.json<ResultatSeances>().seances[0]?.intervenantIds).toEqual(
      [coIntervenantId, intervenantId].sort(),
    );
    const trace = (await audits(s1.id)).filter((a) => a.action === 'seance.modifier').at(-1);
    expect(trace?.avant).toMatchObject({ intervenantIds: [intervenantId] });
    expect(trace?.apres).toMatchObject({
      intervenantIds: [coIntervenantId, intervenantId].sort(),
    });
    const url = `/api/edt/semaine?etablissementId=${campusId}&debut=2026-11-02&intervenantId=${coIntervenantId}`;
    const semaine = (await requete('GET', url, admin)).json<SemaineEdt>();
    expect(semaine.seances.map((s) => s.id)).toEqual([s1.id]);
    const retrait = await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      intervenantIds: [intervenantId],
    });
    expect(retrait.json<ResultatSeances>().seances[0]?.intervenantIds).toEqual([intervenantId]);
    const liens = await owner.db
      .select()
      .from(seanceIntervenant)
      .where(
        and(eq(seanceIntervenant.organisationId, ecole), eq(seanceIntervenant.seanceId, s1.id)),
      );
    expect(liens.filter((l) => l.deletedAt === null).map((l) => l.personneId)).toEqual([
      intervenantId,
    ]);
    // Bascule : la colonne obsolète suit le premier intervenant pour les versions précédentes.
    const [ligne] = await owner.db.select().from(seance).where(eq(seance.id, s1.id));
    expect(ligne?.intervenantId).toBe(intervenantId);
  });

  it('refuse un intervenant inconnu', async () => {
    const reponse = await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      intervenantIds: [intervenantId, newId()],
    });
    expect(reponse.statusCode).toBe(400);
  });
});

describe('Cas limites', () => {
  it('ne déplace pas une séance dont l’appel est fait', async () => {
    await owner.db.insert(presence).values({
      organisationId: ecole,
      seanceId: s1.id,
      personneId: inscriptions[0]?.personne.id ?? '',
      scanneLe: new Date('2026-11-02T08:05:00Z'),
      mode: 'manuel',
    });
    const reponse = await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      debut: '2026-11-02T07:00:00Z',
      fin: '2026-11-02T09:00:00Z',
    });
    expect(reponse.statusCode).toBe(409);
    expect(reponse.json<{ message: string }>().message).toContain('appel');
  });
});
