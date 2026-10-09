import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  EVENEMENT_CHANGEMENT_EDT,
  ROLES_PAR_DEFAUT,
  type DetailPromotion,
  type ElementCree,
  type Formation,
  type Groupe,
  type ListeCorrespondancesEdt,
  type ResultatImportEdt,
  type Salle,
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
  outboxEvenement,
  personne,
  presence,
  role,
  seance,
} from '@scolaly/db';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPasswordAccount, type Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/shared/tokens.js';
import { signInCookie, startApp, WEB_ORIGIN } from './helpers.js';

const PASSWORD = 'phrase de passe des tests de l’import d’emploi du temps';
const owner = createDatabase(inject('migratorUrl'), { max: 2 });
let app: NestFastifyApplication;
const ecole = newId();
let admin: string;
let intervenantCompte: string;
let campusId: string;
let promo: DetailPromotion;
let groupe: Groupe;
let moduleId: string;
let salle: Salle;
let emailIntervenant: string;
let intervenantId: string;

async function compte(code: string) {
  const email = `${code}.${newId()}@import-edt.test`;
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
  return signInCookie(app, email, PASSWORD);
}

const requete = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie: admin, origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  });

const importer = (
  contenu: string,
  options: Record<string, string> = {},
  type = 'text/csv',
  cookie = admin,
) =>
  app.inject({
    method: 'POST',
    url: `/api/edt/import?${new URLSearchParams({ etablissementId: campusId, ...options }).toString()}`,
    headers: { cookie, origin: WEB_ORIGIN, 'content-type': type },
    payload: contenu,
  });

const csv = (...lignes: string[]) =>
  ['Date;Début;Fin;Module;Groupes;Intervenants;Salle;Type;Identifiant', ...lignes].join('\n');
const ligne1 = () => `07/12/2026;08:30;10:30;M1;TD A;${emailIntervenant};Salle 101;TD;HP-1`;
const ligne2 = () => `08/12/2026;14:00;16:00;M1;${promo.libelle};;Salle 101;CM;HP-2`;

const importees = () =>
  owner.db
    .select()
    .from(seance)
    .where(and(eq(seance.organisationId, ecole), isNotNull(seance.identifiantExterne)))
    .orderBy(asc(seance.debut));

beforeAll(async () => {
  app = await startApp();
  await owner.db
    .insert(organisation)
    .values({ id: ecole, nom: 'École de l’import d’EDT', nomAffichage: 'IMP' });
  await initialiserRolesParDefaut(owner.db, ecole, ROLES_PAR_DEFAUT);
  const [campus] = await owner.db
    .insert(etablissement)
    .values({ organisationId: ecole, nom: 'Campus de l’import' })
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
  admin = await compte('administrateur');
  intervenantCompte = await compte('intervenant');
  const formation = (
    await requete('POST', '/api/formations', {
      intitule: 'BTS Import fictif',
      type: 'bts',
      niveau: 5,
      dureeAnnees: 2,
      modes: ['initial'],
      etablissementIds: [campusId],
    })
  ).json<Formation>();
  const version = formation.versions[0]?.id ?? '';
  const ue = (
    await requete('POST', `/api/maquettes/${version}/ues`, {
      code: 'UE1',
      intitule: 'UE',
      ects: 30,
    })
  ).json<ElementCree>();
  moduleId = (
    await requete('POST', `/api/maquettes/${version}/modules`, {
      ueId: ue.id,
      code: 'M1',
      intitule: 'Algorithmique fictive',
      heures: { cm: 20, td: 20 },
    })
  ).json<ElementCree>().id;
  await requete('POST', `/api/maquettes/${version}/publication`);
  promo = (
    await requete('POST', '/api/promotions', {
      formationId: formation.id,
      anneeFormation: 1,
      anneeScolaireId: annee?.id,
      etablissementId: campusId,
    })
  ).json<DetailPromotion>();
  groupe = (
    await requete('POST', `/api/promotions/${promo.id}/groupes`, { libelle: 'TD A', type: 'td' })
  ).json<Groupe>();
  salle = (
    await requete('POST', '/api/salles', {
      etablissementId: campusId,
      nom: 'Salle 101',
      capacite: 30,
      type: 'cours',
    })
  ).json<Salle>();
  emailIntervenant = `camille.${newId()}@import-edt.test`;
  const [fiche] = await owner.db
    .insert(personne)
    .values({ organisationId: ecole, nom: 'Martin', prenom: 'Camille', email: emailIntervenant })
    .returning();
  intervenantId = fiche?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe('US-04-04 import d’un emploi du temps', () => {
  it('RG-01-18 l’aperçu rapproche les libellés, montre les séances et n’écrit rien', async () => {
    const reponse = await importer(csv(ligne1(), ligne2()));
    expect(reponse.statusCode).toBe(200);
    const r = reponse.json<ResultatImportEdt>();
    expect(r).toMatchObject({ apercu: true, importe: false, format: 'csv', erreurs: [] });
    expect(r.compteurs).toMatchObject({ lues: 2, creees: 2, rejetees: 0 });
    expect(r.seances.map((s) => [s.ligne, s.action, s.libelle])).toEqual([
      [2, 'creee', 'Algorithmique fictive'],
      [3, 'creee', 'Algorithmique fictive'],
    ]);
    expect(await importees()).toEqual([]);
  });

  it('RG-04-09 demande la correspondance des libellés inconnus, puis la mémorise', async () => {
    const fichier = csv(`07/12/2026;08:30;10:30;Algo;TD A;Inconnu Total;Salle fantôme;TD;HP-9`);
    const r = (await importer(fichier)).json<ResultatImportEdt>();
    expect(r.inconnus).toEqual([
      { nature: 'module', libelle: 'Algo', lignes: [2] },
      { nature: 'salle', libelle: 'Salle fantôme', lignes: [2] },
      { nature: 'intervenant', libelle: 'Inconnu Total', lignes: [2] },
    ]);
    expect(r.choix).toContainEqual({
      nature: 'module',
      id: moduleId,
      libelle: 'M1 · Algorithmique fictive',
    });
    expect(r.seances).toEqual([]);

    const refus = await requete('PUT', '/api/edt/import/correspondances', {
      correspondances: [{ nature: 'public', libelle: 'TD Z', objetId: null }],
    });
    expect(refus.statusCode).toBe(400);
    const enregistre = await requete('PUT', '/api/edt/import/correspondances', {
      correspondances: [
        { nature: 'module', libelle: 'Algo', objetId: moduleId },
        { nature: 'salle', libelle: 'Salle fantôme', objetId: null },
        { nature: 'intervenant', libelle: 'Inconnu Total', objetId: intervenantId },
      ],
    });
    expect(enregistre.statusCode).toBe(200);
    expect(enregistre.json<ListeCorrespondancesEdt>().correspondances).toHaveLength(3);

    const ensuite = (await importer(fichier)).json<ResultatImportEdt>();
    expect(ensuite.inconnus).toEqual([]);
    expect(ensuite.compteurs.creees).toBe(1);
  });

  it('RG-01-19 refuse tout le fichier si une ligne est en erreur, sauf choix contraire', async () => {
    const fichier = csv(
      ligne1(),
      `09/12/2026;08:10;10:00;M1;TD A;;;TD;HP-3`,
      'pas une date;;;;;;;;',
    );
    const r = (await importer(fichier, { apercu: 'false' })).json<ResultatImportEdt>();
    expect(r.importe).toBe(false);
    expect(r.erreurs).toEqual([
      { ligne: 4, message: 'Date illisible : « pas une date ». Attendu : JJ/MM/AAAA.' },
      { ligne: 3, message: 'Les heures suivent le pas de la grille (15 minutes).' },
    ]);
    expect(r.compteurs.rejetees).toBe(2);
    expect(await importees()).toEqual([]);

    const partiel = (
      await importer(fichier, { apercu: 'false', lignesValides: 'true' })
    ).json<ResultatImportEdt>();
    expect(partiel.importe).toBe(true);
    expect(partiel.compteurs.creees).toBe(1);
    expect((await importees()).map((s) => s.identifiantExterne)).toEqual(['HP-1']);
  });

  it('RG-04-10 importe en brouillon, avec l’identifiant externe, et trace l’import', async () => {
    const r = (
      await importer(csv(ligne1(), ligne2()), { apercu: 'false' })
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    expect(r.compteurs).toMatchObject({ creees: 1, inchangees: 1 });
    const lignes = await importees();
    expect(lignes.map((s) => [s.identifiantExterne, s.statut, s.salleId])).toEqual([
      ['HP-1', 'brouillon', salle.id],
      ['HP-2', 'brouillon', salle.id],
    ]);
    const [trace] = await owner.db
      .select()
      .from(auditEvenement)
      .where(
        and(eq(auditEvenement.organisationId, ecole), eq(auditEvenement.action, 'edt.importer')),
      )
      .orderBy(desc(auditEvenement.survenuLe));
    expect(trace?.apres).toMatchObject({ format: 'csv', creees: 1 });
    expect(JSON.stringify(trace?.apres)).not.toContain('Salle 101');
  });

  it('RG-04-11 un réimport identique ne crée rien', async () => {
    const r = (
      await importer(csv(ligne1(), ligne2()), { apercu: 'false' })
    ).json<ResultatImportEdt>();
    expect(r.compteurs).toMatchObject({ creees: 0, modifiees: 0, inchangees: 2 });
    expect(r.seances).toEqual([]);
    expect(await importees()).toHaveLength(2);
  });

  it('RG-04-11 un réimport met à jour la séance changée et signale la séance disparue', async () => {
    const r = (
      await importer(
        csv(ligne1().replace('10:30', '11:30'), `09/12/2026;08:00;10:00;M1;TD A;;;TD;HP-5`),
        { apercu: 'false' },
      )
    ).json<ResultatImportEdt>();
    expect(r.compteurs).toMatchObject({ modifiees: 1, creees: 1, disparues: 1 });
    expect(r.disparues.map((d) => d.libelle)).toEqual(['Algorithmique fictive']);
    const lignes = await importees();
    expect(lignes[0]?.fin.toISOString()).toBe('2026-12-07T10:30:00.000Z');
    expect(lignes.map((s) => s.statut)).toEqual(['brouillon', 'brouillon', 'brouillon']);
  });

  it('RG-04-12 une séance modifiée dans Scolaly est conservée, sauf choix contraire', async () => {
    const [premiere] = await importees();
    const patch = await requete('PATCH', `/api/edt/seances/${premiere?.id ?? ''}`, {
      salleId: null,
    });
    expect(patch.statusCode).toBe(200);
    const fichier = csv(ligne1().replace(';TD;', ';TP;'), ligne2());
    const garde = (await importer(fichier, { apercu: 'false' })).json<ResultatImportEdt>();
    expect(garde.compteurs).toMatchObject({ conservees: 1 });
    expect(garde.seances.find((s) => s.identifiant === 'HP-1')?.action).toBe('conservee');
    expect((await importees())[0]?.salleId).toBeNull();

    const remplace = (
      await importer(fichier, { apercu: 'false', versionConservee: 'fichier' })
    ).json<ResultatImportEdt>();
    expect(remplace.compteurs.modifiees).toBe(1);
    expect((await importees())[0]).toMatchObject({ salleId: salle.id, type: 'tp' });
  });

  it('RG-04-10 publie directement si demandé', async () => {
    const r = (
      await importer(csv(`10/12/2026;08:00;10:00;M1;TD A;;;CM;HP-4`), {
        apercu: 'false',
        publier: 'true',
      })
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    const lignes = await importees();
    expect(lignes.find((s) => s.identifiantExterne === 'HP-4')?.statut).toBe('publiee');
  });

  it('RG-04-06 laisse en brouillon, signalée, une séance en conflit bloquant', async () => {
    const r = (
      await importer(
        csv(
          `11/12/2026;08:00;10:00;M1;TD A;;Salle 101;CM;HP-6`,
          `11/12/2026;09:00;11:00;M1;${promo.libelle};;Salle 101;CM;HP-7`,
        ),
        { apercu: 'false', publier: 'true' },
      )
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    expect(r.seances.map((s) => s.conflits.map((c) => c.code).sort())).toEqual([
      ['salle-occupee'],
      ['salle-occupee'],
    ]);
    expect(r.avertissements.map((a) => a.ligne)).toEqual([2, 3]);
    const lignes = await importees();
    expect(
      lignes
        .filter((s) => s.identifiantExterne?.startsWith('HP-6') || s.identifiantExterne === 'HP-7')
        .map((s) => s.statut),
    ).toEqual(['brouillon', 'brouillon']);
  });

  it('RG-04-09 importe un fichier iCal avec un public par défaut', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:cours-1@agenda.test',
      'DTSTART;TZID=Europe/Paris:20261214T090000',
      'DTEND;TZID=Europe/Paris:20261214T110000',
      'SUMMARY:Algorithmique fictive',
      'LOCATION:Salle 101',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const r = (
      await importer(ics, { apercu: 'false', groupeId: groupe.id }, 'text/calendar')
    ).json<ResultatImportEdt>();
    expect(r).toMatchObject({ importe: true, format: 'ics', erreurs: [] });
    const [creee] = await owner.db
      .select()
      .from(seance)
      .where(
        and(eq(seance.organisationId, ecole), eq(seance.identifiantExterne, 'cours-1@agenda.test')),
      );
    expect(creee).toMatchObject({
      moduleId,
      statut: 'brouillon',
      debut: new Date('2026-12-14T08:00:00Z'),
    });
  });

  it('refuse un fichier d’un autre format et une personne sans droit de gestion', async () => {
    const json = await importer('{}', {}, 'application/json');
    expect(json.statusCode).toBe(400);
    const interdit = await importer(csv(ligne1()), {}, 'text/csv', intervenantCompte);
    expect(interdit.statusCode).toBe(403);
  });
});

describe('RG-04-11 annulation proposée des séances disparues du fichier', () => {
  const avant = [
    `04/10/2026;08:00;10:00;M1;TD A;;;TD;AN-DEBUT`,
    `05/10/2026;08:00;10:00;M1;TD A;;;TD;AN-PASSEE`,
    `11/01/2027;08:00;10:00;M1;TD A;;;TD;AN-1`,
    `12/01/2027;08:00;10:00;M1;TD A;;;TD;AN-2`,
    `13/01/2027;08:00;10:00;M1;TD A;;;TD;AN-3`,
    `20/01/2027;08:00;10:00;M1;TD A;;;TD;AN-FIN`,
  ];
  const reimport = csv(avant[0] ?? '', avant[5] ?? '');
  const ids: Record<string, string> = {};
  const etat = async (code: string) =>
    (await importees()).find((s) => s.identifiantExterne === code);
  const annulations = async (id: string) =>
    owner.db
      .select()
      .from(auditEvenement)
      .where(and(eq(auditEvenement.objetId, id), eq(auditEvenement.action, 'seance.annuler')));

  beforeAll(async () => {
    const r = (
      await importer(csv(...avant), { apercu: 'false', publier: 'true' })
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    for (const s of await importees())
      if (s.identifiantExterne?.startsWith('AN-')) ids[s.identifiantExterne] = s.id;
    expect(Object.keys(ids)).toHaveLength(6);
    await owner.db.insert(presence).values({
      organisationId: ecole,
      seanceId: ids['AN-2'] ?? '',
      personneId: intervenantId,
      scanneLe: new Date(),
      mode: 'manuel',
    });
  });

  it('RG-04-11 l’aperçu propose les disparues, signale les non annulables et n’annule rien', async () => {
    const r = (await importer(reimport, { annuler: ids['AN-1'] ?? '' })).json<ResultatImportEdt>();
    expect(r.importe).toBe(false);
    const disparues = new Map(r.disparues.map((d) => [d.id, d]));
    expect(disparues.get(ids['AN-PASSEE'] ?? '')).toMatchObject({ refus: 'passee' });
    expect(disparues.get(ids['AN-1'] ?? '')).toMatchObject({ refus: null, annulee: false });
    expect(disparues.get(ids['AN-2'] ?? '')).toMatchObject({ refus: 'appel-fait' });
    expect(disparues.get(ids['AN-3'] ?? '')).toMatchObject({ refus: null, annulee: false });
    expect(r.compteurs.annulees).toBe(0);
    expect((await etat('AN-1'))?.statut).toBe('publiee');
  });

  it('RG-04-11 sans case cochée, la validation n’annule aucune disparue', async () => {
    const r = (await importer(reimport, { apercu: 'false' })).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    expect(r.compteurs.annulees).toBe(0);
    expect(r.disparues.every((d) => !d.annulee)).toBe(true);
    for (const code of ['AN-1', 'AN-2', 'AN-3']) expect((await etat(code))?.statut).toBe('publiee');
  });

  it('RG-04-11 annule seulement les disparues cochées et annulables, notifiées et tracées', async () => {
    const cochees = [ids['AN-1'], ids['AN-2'], ids['AN-PASSEE'], newId()].join(',');
    const r = (
      await importer(reimport, { apercu: 'false', annuler: cochees })
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    expect(r.compteurs.annulees).toBe(1);
    expect(r.disparues.filter((d) => d.annulee).map((d) => d.id)).toEqual([ids['AN-1']]);
    expect(r.avertissements.map((a) => a.message).join(' ')).toContain(
      '3 séance(s) cochée(s) non annulée(s)',
    );
    expect(await etat('AN-1')).toMatchObject({
      statut: 'annulee',
      motifAnnulation: 'Retirée du fichier importé',
    });
    expect((await etat('AN-2'))?.statut).toBe('publiee');
    expect((await etat('AN-3'))?.statut).toBe('publiee');
    expect((await etat('AN-PASSEE'))?.statut).toBe('publiee');
    const [trace] = await annulations(ids['AN-1'] ?? '');
    expect(trace?.avant).toMatchObject({ statut: 'publiee' });
    expect(trace?.apres).toMatchObject({ statut: 'annulee' });
    const evenements = await owner.db
      .select()
      .from(outboxEvenement)
      .where(eq(outboxEvenement.type, EVENEMENT_CHANGEMENT_EDT));
    expect(
      evenements.some(
        (e) =>
          (e.charge as { nature?: string; seanceIds?: string[] }).nature === 'annulation' &&
          (e.charge as { seanceIds?: string[] }).seanceIds?.includes(ids['AN-1'] ?? ''),
      ),
    ).toBe(true);
  });

  it('RG-04-11 une validation rejouée n’annule pas deux fois', async () => {
    const r = (
      await importer(reimport, { apercu: 'false', annuler: ids['AN-1'] ?? '' })
    ).json<ResultatImportEdt>();
    expect(r.importe).toBe(true);
    expect(r.compteurs.annulees).toBe(0);
    expect(r.disparues.map((d) => d.id)).not.toContain(ids['AN-1']);
    expect(await annulations(ids['AN-1'] ?? '')).toHaveLength(1);
  });

  it('RG-04-11 refuse une liste de séances à annuler mal formée', async () => {
    const r = await importer(reimport, { apercu: 'false', annuler: 'pas-un-identifiant' });
    expect(r.statusCode).toBe(400);
  });
});
