import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  newId,
  personne,
  promotion,
  seance,
  seanceIntervenant,
  seancePublic,
} from '@scolaly/db';
import { asc, eq } from 'drizzle-orm';

/**
 * Séance de démonstration (P2) : en attendant l'emploi du temps (I4.1), crée une séance fictive
 * de l'école de démonstration, animée par son compte intervenant, pour la première promotion de
 * l'école (I3.2 : ses inscrits sont attendus, dont le compte apprenant de démonstration).
 * Options : DEMO_ECOLE (EGL par défaut), DEMO_DEBUT_MINUTES (2 par défaut).
 */
if (process.env.NODE_ENV === 'production' && process.env.DEMO_ALLOW_PRODUCTION !== 'true') {
  throw new Error('La séance de démonstration ne se crée pas en production.');
}
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
if (!migratorUrl) throw new Error('MIGRATOR_DATABASE_URL est obligatoire.');
const ecole = (process.env.DEMO_ECOLE ?? 'egl').toLowerCase();
const dansMinutes = Number(process.env.DEMO_DEBUT_MINUTES ?? '2');

const database = createDatabase(migratorUrl, { max: 2 });
try {
  const db = database.db;
  const [intervenant] = await db
    .select()
    .from(personne)
    .where(eq(personne.email, `intervenant@${ecole}.demo.scolaly.test`));
  if (!intervenant) {
    throw new Error('Jeu de démonstration absent : lancez d’abord pnpm demo:seed.');
  }
  const organisationId = intervenant.organisationId;
  const [promo] = await db
    .select()
    .from(promotion)
    .where(eq(promotion.organisationId, organisationId))
    .orderBy(asc(promotion.libelle))
    .limit(1);
  if (!promo) throw new Error('Aucune promotion de démonstration : relancez pnpm demo:seed.');
  const debut = new Date(Date.now() + dansMinutes * 60_000);
  const seanceId = newId();
  await db.insert(seance).values({
    id: seanceId,
    organisationId,
    libelle: `Droit des affaires (démonstration ${randomUUID().slice(0, 4)})`,
    debut,
    fin: new Date(debut.getTime() + 3 * 3600_000),
    intervenantId: intervenant.id,
  });
  await db
    .insert(seanceIntervenant)
    .values({ organisationId, seanceId, personneId: intervenant.id });
  await db.insert(seancePublic).values({ organisationId, seanceId, promotionId: promo.id });
  console.warn(
    `Séance de démonstration créée (${seanceId}) : début ${debut.toLocaleTimeString('fr-FR')}, ` +
      `attendus : la promotion « ${promo.libelle} », animée par intervenant@${ecole}.demo.scolaly.test.`,
  );
} finally {
  await database.close();
}
