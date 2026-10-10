import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLES_EMARGEMENT, OuvertureAppel, ROLES_PAR_DEFAUT } from '@scolaly/contracts';
import {
  attribution,
  authAccount,
  authUser,
  createDatabase,
  etablissement,
  initialiserRolesParDefaut,
  inscrireManquants,
  newId,
  organisation,
  personne,
  promotionTechnique,
  role,
  seance,
  seanceIntervenant,
  seancePublic,
} from '@scolaly/db';
import { and, eq, like } from 'drizzle-orm';
import { createAuth } from '../auth/auth.js';
import { hashPassword } from '../auth/password.js';
import { loadEnv } from '../config/env.js';
import { createValkey } from '../shared/valkey.js';

/**
 * Préparation de la preuve de charge (I2.2, I4.3) : une école fictive, N apprenants avec un compte
 * et une session ouverte, une séance publiée qui les attend tous et que son intervenant ouvre par
 * l'API (CHARGE_API_URL), comme depuis son écran. Écrit le fichier lu par le scénario k6
 * (CHARGE_FICHIER). Les sessions des apprenants sont gardées d'un tir à l'autre (30 jours).
 */
const env = loadEnv();
if (env.NODE_ENV === 'production') {
  throw new Error('La préparation de la charge ne tourne jamais en production.');
}
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
if (!migratorUrl) throw new Error('MIGRATOR_DATABASE_URL est obligatoire.');
const nombre = Number(process.env.CHARGE_APPRENANTS ?? '5000');
const fichier = process.env.CHARGE_FICHIER ?? '../../infra/charge/.donnees/donnees.json';
const motDePasse = 'phrase de passe de la charge, fictive';
const DOMAINE = 'charge.scolaly.test';
const email = (i: number) => `apprenant-${String(i).padStart(5, '0')}@${DOMAINE}`;
const EMAIL_INTERVENANT = `intervenant@${DOMAINE}`;
const apiUrl = process.env.CHARGE_API_URL ?? 'http://localhost:3001';

const owner = createDatabase(migratorUrl, { max: 4 });
const app = createDatabase(env.DATABASE_URL, { max: 8 });
const valkey = createValkey(env.VALKEY_URL);
try {
  const db = owner.db;
  let [ecole] = await db.select().from(organisation).where(eq(organisation.nomAffichage, 'CHARGE'));
  if (!ecole) {
    [ecole] = await db
      .insert(organisation)
      .values({ nom: 'École de la preuve de charge (fictive)', nomAffichage: 'CHARGE' })
      .returning();
  }
  if (!ecole) throw new Error('École de charge introuvable.');
  const organisationId = ecole.id;
  // RG-06-10 : un seul établissement, avec un périmètre de localisation : chaque scan du tir passe
  // par le contrôle (sans position, résultat « inconnu »), toujours sans requête SQL. Un campus
  // créé par une préparation antérieure reçoit lui aussi le périmètre.
  const perimetre = {
    localisationActive: true,
    localisationLatitude: 45.75,
    localisationLongitude: 4.85,
    localisationPlagesIp: ['192.0.2.0/24'],
  };
  const campus = await db
    .update(etablissement)
    .set(perimetre)
    .where(eq(etablissement.organisationId, organisationId))
    .returning({ id: etablissement.id });
  if (campus.length === 0) {
    await db.insert(etablissement).values({
      organisationId,
      nom: 'Campus de la preuve de charge (fictif)',
      ...perimetre,
    });
  }

  // Comptes et fiches manquants, en lots, avec un seul hachage du mot de passe partagé.
  const existants = new Set(
    (
      await db
        .select({ email: authUser.email })
        .from(authUser)
        .where(like(authUser.email, `%@${DOMAINE}`))
    ).map((u) => u.email),
  );
  const hache = await hashPassword(motDePasse);
  const manquants = Array.from({ length: nombre }, (_, i) => email(i)).filter(
    (e) => !existants.has(e),
  );
  for (let debut = 0; debut < manquants.length; debut += 500) {
    const lot = manquants.slice(debut, debut + 500).map((e) => ({ e, userId: newId() }));
    await db
      .insert(authUser)
      .values(lot.map(({ e, userId }) => ({ id: userId, email: e, name: e, emailVerified: true })));
    await db.insert(authAccount).values(
      lot.map(({ userId }) => ({
        userId,
        accountId: userId,
        providerId: 'credential',
        password: hache,
      })),
    );
    await db.insert(personne).values(
      lot.map(({ e, userId }) => ({
        organisationId,
        nom: 'Charge',
        prenom: e.slice(0, e.indexOf('@')),
        email: e,
        userId,
        compteEtat: 'actif' as const,
      })),
    );
  }
  const fiches = await db
    .select({ id: personne.id, userId: personne.userId, email: personne.email })
    .from(personne)
    .where(eq(personne.organisationId, organisationId));
  const parEmail = new Map(fiches.map((f) => [f.email, f]));

  // L'intervenant de l'école de charge (rôle intervenant, périmètre « soi »), créé une fois.
  await initialiserRolesParDefaut(db, organisationId, ROLES_PAR_DEFAUT);
  let intervenantId = parEmail.get(EMAIL_INTERVENANT)?.id;
  if (!intervenantId) {
    const userId = newId();
    await db
      .insert(authUser)
      .values({ id: userId, email: EMAIL_INTERVENANT, name: 'Intervenant', emailVerified: true });
    await db
      .insert(authAccount)
      .values({ userId, accountId: userId, providerId: 'credential', password: hache });
    const [fiche] = await db
      .insert(personne)
      .values({
        organisationId,
        nom: 'Charge',
        prenom: 'Intervenant',
        email: EMAIL_INTERVENANT,
        userId,
        compteEtat: 'actif',
      })
      .returning({ id: personne.id });
    const [roleIntervenant] = await db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.organisationId, organisationId), eq(role.code, 'intervenant')));
    if (!fiche || !roleIntervenant) throw new Error('Intervenant de charge non créé.');
    await db.insert(attribution).values({
      organisationId,
      personneId: fiche.id,
      roleId: roleIntervenant.id,
      perimetreType: 'soi',
      debut: '2026-01-01',
    });
    intervenantId = fiche.id;
  }

  // Sessions : ouvertes par Better Auth lui-même (cookie signé), gardées d'un tir à l'autre.
  const precedent = existsSync(fichier)
    ? (JSON.parse(readFileSync(fichier, 'utf8')) as { cookies?: string[] })
    : {};
  const auth = createAuth(env, app.db, valkey);
  await valkey.connect().catch(() => undefined);
  const connexion = async (adresse: string) => {
    const reponse = await auth.api.signInEmail({
      body: { email: adresse, password: motDePasse },
      asResponse: true,
    });
    const cookie = reponse.headers.get('set-cookie')?.split(';')[0];
    if (!reponse.ok || !cookie) throw new Error(`Connexion refusée : ${adresse}`);
    return cookie;
  };
  let cookies = precedent.cookies ?? [];
  if (cookies.length < nombre) {
    cookies = [];
    for (let debut = 0; debut < nombre; debut += 16) {
      const lot = await Promise.all(
        Array.from({ length: Math.min(16, nombre - debut) }, (_, k) => connexion(email(debut + k))),
      );
      cookies.push(...lot);
      if (debut % 1000 === 0)
        console.warn(`Sessions ouvertes : ${String(cookies.length)}/${String(nombre)}`);
    }
  }
  const cookieIntervenant = await connexion(EMAIL_INTERVENANT);

  // Une séance neuve à chaque tir : en cours depuis une minute, tous les apprenants attendus,
  // animée par l'intervenant de l'école de charge (RG-04-01), qui en ouvre l'appel par l'API.
  const seanceId = newId();
  const debutSeance = new Date(Date.now() - 60_000);
  const finSeance = new Date(debutSeance.getTime() + 3 * 3600_000);
  await db.insert(seance).values({
    id: seanceId,
    organisationId,
    libelle: 'Séance de la preuve de charge',
    debut: debutSeance,
    fin: finSeance,
  });
  await db
    .insert(seanceIntervenant)
    .values({ organisationId, seanceId, personneId: intervenantId });
  // Les apprenants sont inscrits (une fois) à une promotion technique, public de la séance.
  const attendus = Array.from({ length: nombre }, (_, i) => parEmail.get(email(i))).flatMap((f) =>
    f ? [f] : [],
  );
  const promotionId = await promotionTechnique(
    db,
    organisationId,
    'Promotion de la preuve de charge',
  );
  await inscrireManquants(
    db,
    organisationId,
    promotionId,
    attendus.map((f) => f.id),
  );
  await db.insert(seancePublic).values({ organisationId, seanceId, promotionId });
  await valkey.del(CLES_EMARGEMENT.presences(seanceId));

  // Ouverture de l'appel comme à l'écran de l'intervenant : préchargement et sessions en cache
  // (RG-00-17), clé de la séance renvoyée pour calculer le QR.
  const reponse = await fetch(`${apiUrl}/api/seances/${seanceId}/appel/ouverture`, {
    method: 'POST',
    headers: { cookie: cookieIntervenant, origin: env.WEB_ORIGIN },
  });
  if (!reponse.ok)
    throw new Error(
      `Ouverture de l'appel refusée : ${String(reponse.status)} ${await reponse.text()}`,
    );
  const ouverture = OuvertureAppel.parse(await reponse.json());

  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(
    fichier,
    JSON.stringify({
      seanceId,
      cle: Buffer.from(ouverture.cle, 'base64url').toString('base64'),
      intervenant: cookieIntervenant,
      cookies,
    }),
  );
  console.warn(
    `Prêt : séance ${seanceId}, ${String(attendus.length)} apprenants, fichier ${fichier}.`,
  );
} finally {
  valkey.disconnect();
  await owner.close();
  await app.close();
}
