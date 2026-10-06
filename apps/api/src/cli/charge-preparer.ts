import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLES_EMARGEMENT, commandesPrechargement, commandesSessions } from '@scolaly/contracts';
import {
  authAccount,
  authUser,
  createDatabase,
  newId,
  organisation,
  personne,
  seance,
  seanceAttendu,
  sessionsDesComptes,
} from '@scolaly/db';
import { eq, like } from 'drizzle-orm';
import { createAuth } from '../auth/auth.js';
import { hashPassword } from '../auth/password.js';
import { loadEnv } from '../config/env.js';
import { cleDeSeance } from '../modules/emargement/cache-emargement.js';
import { createValkey } from '../shared/valkey.js';

/**
 * Préparation de la preuve de charge (I2.2) : une école fictive, N apprenants avec un compte et une
 * session ouverte, une séance qui les attend tous, préchargée dans Valkey. Écrit le fichier lu par
 * le scénario k6 (CHARGE_FICHIER). Les sessions sont gardées d'un tir à l'autre (30 jours).
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

  // Sessions : ouvertes par Better Auth lui-même (cookie signé), gardées d'un tir à l'autre.
  const precedent = existsSync(fichier)
    ? (JSON.parse(readFileSync(fichier, 'utf8')) as { cookies?: string[] })
    : {};
  let cookies = precedent.cookies ?? [];
  if (cookies.length < nombre) {
    const auth = createAuth(env, app.db, valkey);
    await valkey.connect().catch(() => undefined);
    cookies = [];
    for (let debut = 0; debut < nombre; debut += 16) {
      const lot = await Promise.all(
        Array.from({ length: Math.min(16, nombre - debut) }, async (_, k) => {
          const reponse = await auth.api.signInEmail({
            body: { email: email(debut + k), password: motDePasse },
            asResponse: true,
          });
          const cookie = reponse.headers.get('set-cookie')?.split(';')[0];
          if (!reponse.ok || !cookie) throw new Error(`Connexion refusée : ${email(debut + k)}`);
          return cookie;
        }),
      );
      cookies.push(...lot);
      if (debut % 1000 === 0)
        console.warn(`Sessions ouvertes : ${String(cookies.length)}/${String(nombre)}`);
    }
  } else {
    await valkey.connect().catch(() => undefined);
  }

  // Une séance neuve à chaque tir : en cours depuis une minute, tous les apprenants attendus.
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
  const attendus = Array.from({ length: nombre }, (_, i) => parEmail.get(email(i))).flatMap((f) =>
    f ? [f] : [],
  );
  for (let debut = 0; debut < attendus.length; debut += 1000) {
    await db
      .insert(seanceAttendu)
      .values(
        attendus
          .slice(debut, debut + 1000)
          .map((f) => ({ organisationId, seanceId, personneId: f.id })),
      );
  }
  await valkey
    .pipeline(
      commandesPrechargement(
        seanceId,
        {
          organisationId,
          libelle: 'Séance de la preuve de charge',
          debut: debutSeance.getTime(),
          fin: finSeance.getTime(),
          distanciel: false,
        },
        new Map(attendus.flatMap((f) => (f.userId ? [[f.userId, f.id] as const] : []))),
      ),
    )
    .exec();
  await valkey.del(CLES_EMARGEMENT.presences(seanceId));
  // Sessions remises en cache, comme à l'ouverture de l'appel (RG-00-17).
  const comptes = attendus.flatMap((f) => (f.userId ? [f.userId] : []));
  const sessions = await sessionsDesComptes(app.db, comptes);
  for (let debut = 0; debut < sessions.length; debut += 5000) {
    await valkey.pipeline(commandesSessions(sessions.slice(debut, debut + 5000))).exec();
  }

  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(
    fichier,
    JSON.stringify({
      seanceId,
      cle: Buffer.from(
        cleDeSeance(Buffer.from(env.ENCRYPTION_MASTER_KEY_V1, 'base64'), organisationId, seanceId),
      ).toString('base64'),
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
