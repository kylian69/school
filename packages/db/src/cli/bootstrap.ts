import { bootstrapRoles } from '../bootstrap.js';
import { requireEnv } from './env.js';

await bootstrapRoles({
  adminUrl: requireEnv('ADMIN_DATABASE_URL'),
  migratorPassword: requireEnv('MIGRATOR_DATABASE_PASSWORD'),
  appPassword: requireEnv('APP_DATABASE_PASSWORD'),
});
console.warn('Rôles PostgreSQL à jour.');
