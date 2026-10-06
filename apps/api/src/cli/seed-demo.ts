import 'reflect-metadata';
import { createDatabase } from '@scolaly/db';
import { createAuth } from '../auth/auth.js';
import { loadEnv } from '../config/env.js';
import { seedDemo } from '../demo/seed-demo.js';
import { createValkey } from '../shared/valkey.js';

const env = loadEnv();
if (env.NODE_ENV === 'production' && process.env.DEMO_ALLOW_PRODUCTION !== 'true') {
  throw new Error(
    'Le jeu de démonstration ne se charge pas en production. Pour le site de démonstration, ' +
      'définir DEMO_ALLOW_PRODUCTION=true sur une instance sans données réelles.',
  );
}
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
const password = process.env.DEMO_PASSWORD;
if (!migratorUrl || !password || password.length < 12) {
  throw new Error(
    'MIGRATOR_DATABASE_URL et DEMO_PASSWORD (12 caractères au moins) sont obligatoires.',
  );
}

const database = createDatabase(env.DATABASE_URL, { max: 2 });
const valkey = createValkey(env.VALKEY_URL);
try {
  const result = await seedDemo({
    auth: createAuth(env, database.db, valkey),
    migratorUrl,
    password,
  });
  console.warn(
    result.donneesEcrites ? 'Jeu de démonstration chargé.' : 'Jeu de démonstration déjà présent.',
  );
  for (const email of result.comptesCrees) console.warn(`Compte créé : ${email}`);
} finally {
  await database.close();
  valkey.disconnect();
}
