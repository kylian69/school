import { randomUUID } from 'node:crypto';
import { createDatabase, newId, personne, seance, seanceAttendu } from '@scolaly/db';
import { and, eq, isNull, notInArray } from 'drizzle-orm';

/**
 * Séance de démonstration (P2) : en attendant l'emploi du temps (I4.1), crée une séance fictive
 * de l'école de démonstration, animée par son compte intervenant, avec toutes ses fiches
 * fictives attendues. Options : DEMO_ECOLE (EGL par défaut), DEMO_DEBUT_MINUTES (2 par défaut).
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
  // Toutes les fiches fictives de l'école, sauf les comptes du personnel de démonstration.
  const personnel = ['administrateur', 'scolarite', 'intervenant'].map(
    (r) => `${r}@${ecole}.demo.scolaly.test`,
  );
  const apprenants = await db
    .select({ id: personne.id })
    .from(personne)
    .where(
      and(
        eq(personne.organisationId, organisationId),
        notInArray(personne.email, personnel),
        isNull(personne.deletedAt),
      ),
    );
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
  if (apprenants.length > 0) {
    await db
      .insert(seanceAttendu)
      .values(apprenants.map((a) => ({ organisationId, seanceId, personneId: a.id })));
  }
  console.warn(
    `Séance de démonstration créée (${seanceId}) : début ${debut.toLocaleTimeString('fr-FR')}, ` +
      `${apprenants.length} apprenants attendus, animée par intervenant@${ecole}.demo.scolaly.test.`,
  );
} finally {
  await database.close();
}
