import 'reflect-metadata';
import { createDatabase } from '@scolaly/db';
import { createAuth } from '../auth/auth.js';
import { loadEnv } from '../config/env.js';
import { creerSuperAdministrateur } from '../modules/plateforme/index.js';
import { createValkey } from '../shared/valkey.js';

// Création du premier super-administrateur du SaaS :
//   SUPER_ADMIN_EMAIL=… SUPER_ADMIN_NOM=… SUPER_ADMIN_PASSWORD=… pnpm plateforme:super-admin
const env = loadEnv();
const {
  SUPER_ADMIN_EMAIL: email,
  SUPER_ADMIN_NOM: name,
  SUPER_ADMIN_PASSWORD: password,
} = process.env;
if (env.SCOLALY_MODE !== 'saas' || !env.PLATFORM_DATABASE_URL) {
  throw new Error('La console de la plateforme n’existe qu’en mode SaaS (SCOLALY_MODE=saas).');
}
if (!email || !name || !password) {
  throw new Error('SUPER_ADMIN_EMAIL, SUPER_ADMIN_NOM et SUPER_ADMIN_PASSWORD sont obligatoires.');
}
const database = createDatabase(env.DATABASE_URL, { max: 2 });
const valkey = createValkey(env.VALKEY_URL);
try {
  const { cree } = await creerSuperAdministrateur({
    auth: createAuth(env, database.db, valkey),
    platformUrl: env.PLATFORM_DATABASE_URL,
    email,
    name,
    password,
  });
  console.warn(
    cree ? `Super-administrateur créé : ${email}` : `${email} est déjà super-administrateur.`,
  );
} finally {
  await database.close();
  valkey.disconnect();
}
