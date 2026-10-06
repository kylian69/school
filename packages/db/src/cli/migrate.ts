import { runMigrations } from '../migrate.js';
import { requireEnv } from './env.js';

await runMigrations(requireEnv('MIGRATOR_DATABASE_URL'));
console.warn('Migrations appliquées.');
