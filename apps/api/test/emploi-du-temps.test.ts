import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLES_EMARGEMENT,
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
  affectation,
  anneeScolaire,
  attribution,
  auditEvenement,
  calendrierAlternance,
  createDatabase,
  disponibiliteIntervenant,
  etablissement,
  fermeture,
  indisponibiliteIntervenant,
  initialiserRolesParDefaut,
  newId,
  organisation,
  outboxEvenement,
  personne,
  presence,
  role,
  seanceIntervenant,
} from '@scolaly/db';
import { and, asc, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import type { FieldEncryption } from '../src/shared/crypto/field-encryption.js';
import { AUTH, FIELD_ENCRYPTION, VALKEY } from '../src/shared/tokens.js';
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
  });

  it('refuse un intervenant inconnu', async () => {
    const reponse = await requete('PATCH', `/api/edt/seances/${s1.id}`, admin, {
      intervenantIds: [intervenantId, newId()],
    });
    expect(reponse.statusCode).toBe(400);
  });
});

describe('E-04-01 fond de la grille et modules à placer', () => {
  const semaine = async (cookie: string, debut: string, filtre: string) => {
    const reponse = await requete(
      'GET',
      `/api/edt/semaine?etablissementId=${campusId}&debut=${debut}&${filtre}`,
      cookie,
    );
    expect(reponse.statusCode).toBe(200);
    return reponse.json<SemaineEdt>();
  };
  const ligne = (s: SemaineEdt, type: string) =>
    s.aPlacer?.find((m) => m.moduleId === moduleId && m.type === type);

  it('RG-01-04 nomme les fermetures et les jours fériés de chaque jour', async () => {
    const toussaint = await semaine(admin, '2026-10-19', `salleId=${salles.grande.id}`);
    expect(toussaint.jours).toHaveLength(7);
    expect(toussaint.jours.every((j) => j.fermeture === 'Toussaint')).toBe(true);
    const armistice = await semaine(admin, '2026-11-09', `salleId=${salles.grande.id}`);
    expect(armistice.jours[0]).toEqual({ jour: '2026-11-09', fermeture: null, entreprise: false });
    expect(armistice.jours[2]?.fermeture).toBeTruthy();
  });

  it('RG-03-13 grise les jours en entreprise du rythme de la promotion et de ses groupes', async () => {
    await owner.db.insert(calendrierAlternance).values({
      organisationId: ecole,
      promotionId: promo.id,
      modele: 'Fictif',
      jours: { '2026-11-16': 'entreprise', '2026-11-17': 'ecole' },
    });
    for (const filtre of [`promotionId=${promo.id}`, `groupeId=${groupe.id}`]) {
      const s = await semaine(admin, '2026-11-16', filtre);
      expect(s.jours.map((j) => j.entreprise)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    }
    // Sans public affiché (vue par salle), aucun jour n'est grisé.
    const parSalle = await semaine(admin, '2026-11-16', `salleId=${salles.grande.id}`);
    expect(parSalle.jours.some((j) => j.entreprise)).toBe(false);
  });

  it('RG-04-16 donne le volume restant par type et le met à jour quand une séance est placée', async () => {
    const avant = await semaine(admin, '2026-12-07', `promotionId=${promo.id}`);
    expect(ligne(avant, 'cm')).toMatchObject({ code: 'M1', prevuMinutes: 600 });
    expect(ligne(avant, 'td')?.prevuMinutes).toBe(120);
    const groupeAvant = await semaine(admin, '2026-12-07', `groupeId=${groupe.id}`);
    const cree = await requete('POST', '/api/edt/seances', admin, {
      type: 'cm',
      moduleId,
      promotionIds: [promo.id],
      debut: '2026-12-07T08:00:00Z',
      fin: '2026-12-07T11:00:00Z',
    });
    expect(cree.statusCode).toBe(201);
    const apres = await semaine(admin, '2026-12-07', `promotionId=${promo.id}`);
    expect(ligne(apres, 'cm')?.planifieMinutes).toBe(
      (ligne(avant, 'cm')?.planifieMinutes ?? 0) + 180,
    );
    expect(ligne(apres, 'cm')?.restantMinutes).toBe(
      600 - (ligne(apres, 'cm')?.planifieMinutes ?? 0),
    );
    expect(ligne(apres, 'td')).toEqual(ligne(avant, 'td'));
    // Un cours de la promotion entière compte aussi pour ses groupes.
    const groupeApres = await semaine(admin, '2026-12-07', `groupeId=${groupe.id}`);
    expect(ligne(groupeApres, 'cm')?.planifieMinutes).toBe(
      (ligne(groupeAvant, 'cm')?.planifieMinutes ?? 0) + 180,
    );
  });

  it('RG-04-18 montre les disponibilités de l’intervenant et les compte dans les conflits', async () => {
    await owner.db.insert(disponibiliteIntervenant).values({
      organisationId: ecole,
      personneId: coIntervenantId,
      jourSemaine: 1,
      heureDebut: '08:00',
      heureFin: '12:00',
    });
    await owner.db.insert(indisponibiliteIntervenant).values([
      {
        organisationId: ecole,
        personneId: coIntervenantId,
        debut: new Date('2026-12-15T08:00:00Z'),
        fin: new Date('2026-12-15T12:00:00Z'),
      },
      {
        organisationId: ecole,
        personneId: coIntervenantId,
        debut: new Date('2027-01-15T08:00:00Z'),
        fin: new Date('2027-01-15T12:00:00Z'),
      },
    ]);
    const s = await semaine(admin, '2026-12-14', `intervenantId=${coIntervenantId}`);
    expect(s.disponibilites).toEqual({
      creneaux: [{ jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00' }],
      indisponibilites: [
        { debut: '2026-12-15T08:00:00.000Z', fin: '2026-12-15T12:00:00.000Z', motif: null },
      ],
    });
    expect(s.aPlacer).toBeNull();
    const verification = await requete('POST', '/api/edt/verification', admin, {
      type: 'cm',
      moduleId,
      promotionIds: [promo.id],
      intervenantIds: [coIntervenantId],
      debut: '2026-12-15T13:00:00Z',
      fin: '2026-12-15T14:00:00Z',
    });
    expect(verification.json<ResultatVerification>().conflits).toContainEqual({
      code: 'intervenant-indisponible',
      niveau: 'avertissement',
      intervenantId: coIntervenantId,
      raison: 'hors-disponibilites',
    });
  });

  it('réserve disponibilités et modules à placer à qui construit l’emploi du temps', async () => {
    const direction = await compte('direction');
    const parIntervenant = await semaine(
      direction,
      '2026-12-14',
      `intervenantId=${coIntervenantId}`,
    );
    expect(parIntervenant.disponibilites).toBeNull();
    const parPromotion = await semaine(direction, '2026-12-07', `promotionId=${promo.id}`);
    expect(parPromotion.aPlacer).toBeNull();
    expect(parPromotion.jours).toHaveLength(7);
  });

  it('RG-04-18 montre le motif d’indisponibilité aux seuls gestionnaires de l’intervenant', async () => {
    const id = newId();
    const motif = 'Jury de soutenance fictif';
    await owner.db.insert(indisponibiliteIntervenant).values({
      id,
      organisationId: ecole,
      personneId: intervenantId,
      debut: new Date('2026-12-22T08:00:00Z'),
      fin: new Date('2026-12-22T10:00:00Z'),
      motifChiffre: app
        .get<FieldEncryption>(FIELD_ENCRYPTION)
        .encrypt(motif, ecole, `indisponibilite_intervenant.motif:${id}`),
    });
    const motifs = async (cookie: string) =>
      (
        await semaine(cookie, '2026-12-21', `intervenantId=${intervenantId}`)
      ).disponibilites?.indisponibilites.map((i) => i.motif);

    // Toute l'école : scolarité.
    expect(await motifs(scolarite)).toEqual([motif]);
    // Lecture seule de l'EDT : ni disponibilités ni motif.
    const direction = await semaine(
      await compte('direction'),
      '2026-12-21',
      `intervenantId=${intervenantId}`,
    );
    expect(direction.disponibilites).toBeNull();
    expect(JSON.stringify(direction)).not.toContain(motif);

    // Responsable d'une promotion : motif seulement si l'intervenant y est affecté.
    const email = `responsable.${newId()}@edt.test`;
    const { userId } = await createPasswordAccount(app.get<Auth>(AUTH), {
      email,
      name: 'Fictif',
      password: PASSWORD,
    });
    const [fiche] = await owner.db
      .insert(personne)
      .values({ organisationId: ecole, nom: 'Fictif', prenom: 'Eli', email, userId })
      .returning();
    const [responsable] = await owner.db
      .select()
      .from(role)
      .where(and(eq(role.organisationId, ecole), eq(role.code, 'responsable-pedagogique')));
    await owner.db.insert(attribution).values({
      organisationId: ecole,
      personneId: fiche?.id ?? '',
      roleId: responsable?.id ?? '',
      perimetreType: 'promotion',
      perimetreId: promo.id,
      debut: '2026-01-01',
    });
    const cookie = await signInCookie(app, email, PASSWORD);
    expect(await motifs(cookie)).toEqual([null]);
    await owner.db.insert(affectation).values({
      organisationId: ecole,
      personneId: intervenantId,
      moduleId,
      promotionId: promo.id,
    });
    expect(await motifs(cookie)).toEqual([motif]);
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

describe('US-04-11 annulation, report et remplacement', () => {
  // Créneaux lointains et libres : le report exige un créneau à venir.
  const creneau = (jour: string) => ({
    debut: `2099-03-${jour}T08:00:00Z`,
    fin: `2099-03-${jour}T10:00:00Z`,
  });
  let origine: Seance;
  let remplacement: Seance;
  const publiee = async (jour: string, salleId = salles.amphi.id) => {
    const creee = (
      await requete('POST', '/api/edt/seances', admin, {
        type: 'td',
        activite: 'Rattrapage fictif',
        groupeIds: [groupe.id],
        salleId,
        intervenantIds: [intervenantId, coIntervenantId],
        ...creneau(jour),
      })
    ).json<Seance>();
    const reponse = await requete('POST', '/api/edt/publication', admin, {
      seanceIds: [creee.id],
    });
    expect(reponse.statusCode).toBe(200);
    return reponse.json<ResultatSeances>().seances[0] as Seance;
  };

  beforeAll(async () => {
    origine = await publiee('03');
  });

  it('US-04-11 refuse le report d’un brouillon ou sans motif', async () => {
    const brouillon = (
      await requete('POST', '/api/edt/seances', admin, {
        type: 'td',
        activite: 'Brouillon fictif',
        groupeIds: [groupe.id],
        ...creneau('24'),
      })
    ).json<Seance>();
    const reponse = await requete('POST', `/api/edt/seances/${brouillon.id}/report`, admin, {
      motif: 'Grève',
      ...creneau('25'),
    });
    expect(reponse.statusCode).toBe(409);
    const sansMotif = await requete('POST', `/api/edt/seances/${origine.id}/report`, admin, {
      motif: ' ',
      ...creneau('10'),
    });
    expect(sansMotif.statusCode).toBe(400);
    const parIntervenant = await requete(
      'POST',
      `/api/edt/seances/${origine.id}/report`,
      await compte('intervenant'),
      { motif: 'Grève', ...creneau('10') },
    );
    expect(parIntervenant.statusCode).toBe(403);
  });

  it('US-04-11 refuse un nouveau créneau en conflit bloquant', async () => {
    await publiee('17');
    const reponse = await requete('POST', `/api/edt/seances/${origine.id}/report`, admin, {
      motif: 'Intervenant malade',
      ...creneau('17'),
    });
    expect(reponse.statusCode).toBe(409);
    expect(reponse.json<{ message: string }>().message).toContain('conflits bloquants');
  });

  it('US-04-11 reporte une séance publiée : séance de remplacement publiée et lien tracés', async () => {
    const reponse = await requete('POST', `/api/edt/seances/${origine.id}/report`, admin, {
      motif: 'Intervenant malade',
      salleId: salles.grande.id,
      ...creneau('10'),
    });
    expect(reponse.statusCode).toBe(200);
    const { seances } = reponse.json<ResultatSeances>();
    const reportee = seances.find((s) => s.id === origine.id);
    remplacement = seances.find((s) => s.id !== origine.id) as Seance;
    expect(reportee).toMatchObject({
      statut: 'reportee',
      motifAnnulation: 'Intervenant malade',
      reporteeVersId: remplacement.id,
      modifiable: false,
    });
    expect(reportee?.modifieeLe).not.toBeNull();
    expect(remplacement).toMatchObject({
      statut: 'publiee',
      libelle: 'Rattrapage fictif',
      salleId: salles.grande.id,
      groupeIds: [groupe.id],
      intervenantIds: [intervenantId, coIntervenantId].sort(),
      modifiable: true,
    });
    expect(remplacement.debut).toBe('2099-03-10T08:00:00.000Z');
    expect(remplacement.modifieeLe).not.toBeNull();
    const trace = (await audits(origine.id)).find((a) => a.action === 'seance.reporter');
    expect(trace?.avant).toMatchObject({ statut: 'publiee' });
    expect(trace?.apres).toMatchObject({
      seance: { statut: 'reportee' },
      remplacement: { id: remplacement.id },
    });
  });

  it('US-04-11 une séance reportée ne se modifie, ne se publie, ni ne s’émarge plus', async () => {
    const modif = await requete('PATCH', `/api/edt/seances/${origine.id}`, admin, {
      salleId: salles.amphi.id,
    });
    expect(modif.statusCode).toBe(409);
    const publication = await requete('POST', '/api/edt/publication', admin, {
      seanceIds: [origine.id],
    });
    expect(publication.statusCode).toBe(409);
    const appel = await requete('POST', `/api/seances/${origine.id}/appel/ouverture`, admin);
    expect(appel.statusCode).toBe(409);
  });

  it('US-04-11 remplace un intervenant et garde le co-intervenant', async () => {
    const [nouveau] = await owner.db
      .insert(personne)
      .values({
        organisationId: ecole,
        nom: 'Remplaçant',
        prenom: 'Sacha',
        email: `remplacant.${newId()}@edt.test`,
      })
      .returning();
    const absent = await requete(
      'POST',
      `/api/edt/seances/${remplacement.id}/remplacement`,
      admin,
      {
        ancienId: nouveau?.id,
        nouveauId: intervenantId,
      },
    );
    expect(absent.statusCode).toBe(400);
    const reponse = await requete(
      'POST',
      `/api/edt/seances/${remplacement.id}/remplacement`,
      admin,
      { ancienId: intervenantId, nouveauId: nouveau?.id },
    );
    expect(reponse.statusCode).toBe(200);
    const [apres] = reponse.json<ResultatSeances>().seances;
    expect(apres?.intervenantIds).toEqual([coIntervenantId, nouveau?.id ?? ''].sort());
    const trace = (await audits(remplacement.id)).find(
      (a) => a.action === 'seance.remplacer-intervenant',
    );
    expect((trace?.avant as Seance | undefined)?.intervenantIds).toContain(intervenantId);
    expect(trace?.apres).toMatchObject({ intervenantIds: apres?.intervenantIds });
  });

  it('RG-04-14 ne date la modification que d’une séance publiée', async () => {
    const brouillon = (
      await requete('POST', '/api/edt/seances', admin, {
        type: 'td',
        activite: 'Brouillon daté',
        groupeIds: [groupe.id],
        ...creneau('26'),
      })
    ).json<Seance>();
    const modifie = await requete('PATCH', `/api/edt/seances/${brouillon.id}`, admin, {
      salleId: salles.grande.id,
    });
    expect(modifie.json<ResultatSeances>().seances[0]?.modifieeLe).toBeNull();
    const publiee31 = await publiee('31');
    expect(publiee31.modifieeLe).toBeNull();
    const deplacee = await requete('PATCH', `/api/edt/seances/${publiee31.id}`, admin, {
      lienVisio: 'https://visio.example.test/fictive',
    });
    expect(deplacee.json<ResultatSeances>().seances[0]?.modifieeLe).toBeNull();
    const changee = await requete('PATCH', `/api/edt/seances/${publiee31.id}`, admin, {
      salleId: salles.grande.id,
    });
    expect(changee.json<ResultatSeances>().seances[0]?.modifieeLe).not.toBeNull();
  });

  it('US-04-11 une annulation retire la séance du cache de l’émargement', async () => {
    const valkey = app.get<Redis>(VALKEY);
    const cle = CLES_EMARGEMENT.seance(remplacement.id);
    await valkey.hset(cle, 'organisationId', ecole);
    await valkey.hset(CLES_EMARGEMENT.presences(remplacement.id), 'fiche', '{}');
    const reponse = await requete('POST', `/api/edt/seances/${remplacement.id}/annulation`, admin, {
      motif: 'Fermeture exceptionnelle',
    });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json<ResultatSeances>().seances[0]).toMatchObject({ statut: 'annulee' });
    expect(await valkey.exists(cle)).toBe(0);
    // Les présences déjà scannées restent, le worker les écrit en base.
    expect(await valkey.exists(CLES_EMARGEMENT.presences(remplacement.id))).toBe(1);
    await valkey.del(CLES_EMARGEMENT.presences(remplacement.id));
  });

  it('RG-04-14 signale la publication et chaque changement significatif, avec le badge « modifié »', async () => {
    const signalee = await publiee('27');
    expect(signalee.modifiee).toBe(false);
    const changee = await requete('PATCH', `/api/edt/seances/${signalee.id}`, admin, {
      salleId: salles.grande.id,
      intervenantIds: [coIntervenantId],
    });
    expect(changee.json<ResultatSeances>().seances[0]?.modifiee).toBe(true);
    // Un changement mineur (lien de visio) n'est pas signalé.
    await requete('PATCH', `/api/edt/seances/${signalee.id}`, admin, {
      lienVisio: 'https://visio.example.test/autre',
    });
    await requete('POST', `/api/edt/seances/${signalee.id}/annulation`, admin, {
      motif: 'Fermeture exceptionnelle',
    });
    const evenements = await owner.db
      .select({ charge: outboxEvenement.charge })
      .from(outboxEvenement)
      .where(
        and(eq(outboxEvenement.organisationId, ecole), eq(outboxEvenement.type, 'edt.changement')),
      )
      .orderBy(asc(outboxEvenement.survenuLe));
    expect(
      evenements
        .map((e) => e.charge as { seanceIds: string[] })
        .filter((c) => c.seanceIds.includes(signalee.id)),
    ).toEqual([
      { nature: 'publication', seanceIds: [signalee.id], retraits: [] },
      {
        nature: 'modification',
        seanceIds: [signalee.id],
        retraits: [{ seanceId: signalee.id, personneId: intervenantId }],
      },
      { nature: 'annulation', seanceIds: [signalee.id], retraits: [] },
    ]);
  });

  it('RG-04-14 suit la durée du badge « modifié » choisie par l’école', async () => {
    const s = await publiee('28');
    const modifier = async (changement: Record<string, unknown>) =>
      (
        await requete('PATCH', `/api/edt/seances/${s.id}`, admin, changement)
      ).json<ResultatSeances>().seances[0]?.modifiee;
    const badge = async (jours: number | null) =>
      (await requete('PATCH', '/api/organisation', admin, { edtBadgeModifieJours: jours }))
        .statusCode;
    expect(await modifier({ salleId: salles.grande.id })).toBe(true);
    expect(await badge(0)).toBe(200);
    expect(await modifier({ lienVisio: 'https://visio.example.test/zero' })).toBe(false);
    // Retour à la valeur par défaut de l'instance (7 jours).
    expect(await badge(null)).toBe(200);
    expect(await modifier({ lienVisio: 'https://visio.example.test/defaut' })).toBe(true);
  });
});
