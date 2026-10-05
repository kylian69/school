export { bootstrapRoles, type BootstrapOptions } from './bootstrap.js';
export { createDatabase, type Database, type DatabaseHandle } from './client.js';
export { isUuid, newId } from './ids.js';
export {
  ajouterEvenement,
  creerPartitionsAudit,
  enregistrerAudit,
  enregistrerAuditPlateforme,
  publierEvenements,
  type AuditEntry,
  type EvenementAPublier,
} from './journal.js';
export { MIGRATIONS_FOLDER, runMigrations } from './migrate.js';
export { withOrganisation, type Transaction } from './organisation-context.js';
export { APP_ROLE, MIGRATOR_ROLE, PLATFORM_ROLE } from './roles.js';
export * from './schema/index.js';
export { auditEvenement, outboxEvenement } from './schema/journal.js';
