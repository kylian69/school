import pg from 'pg';
import { APP_ROLE, MIGRATOR_ROLE } from './roles.js';

export interface BootstrapOptions {
  /** Connexion d'administration (superutilisateur ou CREATEROLE) à la base cible. */
  adminUrl: string;
  migratorPassword: string;
  appPassword: string;
}

const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Crée ou met à jour les deux rôles et leurs droits (idempotent). À lancer une fois à
 * l'installation, puis à chaque mise à jour, avant les migrations.
 */
export async function bootstrapRoles(options: BootstrapOptions): Promise<void> {
  const client = new pg.Client({ connectionString: options.adminUrl });
  await client.connect();
  try {
    const database = (await client.query<{ db: string }>('select current_database() as db')).rows[0]
      ?.db;
    if (!database) throw new Error('Base de données introuvable.');
    const ensureRole = async (role: string, password: string, extra: string) => {
      const exists = await client.query('select 1 from pg_roles where rolname = $1', [role]);
      const verb = exists.rowCount ? 'alter' : 'create';
      await client.query(
        `${verb} role ${role} with login password ${quoteLiteral(password)} ${extra}`,
      );
    };
    await ensureRole(MIGRATOR_ROLE, options.migratorPassword, 'nosuperuser nobypassrls');
    await ensureRole(
      APP_ROLE,
      options.appPassword,
      'nosuperuser nobypassrls nocreatedb nocreaterole',
    );
    await client.query(`grant connect, create on database "${database}" to ${MIGRATOR_ROLE}`);
    await client.query(`grant connect on database "${database}" to ${APP_ROLE}`);
    await client.query(`grant usage, create on schema public to ${MIGRATOR_ROLE}`);
    await client.query(`grant usage on schema public to ${APP_ROLE}`);
    // Les tables créées par les migrations sont accessibles en lecture et écriture au rôle
    // applicatif ; les exceptions (audit en ajout seul, tables de plateforme) sont révoquées
    // dans leur migration.
    await client.query(
      `alter default privileges for role ${MIGRATOR_ROLE} in schema public
         grant select, insert, update, delete on tables to ${APP_ROLE}`,
    );
    await client.query(
      `alter default privileges for role ${MIGRATOR_ROLE} in schema public
         grant usage, select on sequences to ${APP_ROLE}`,
    );
  } finally {
    await client.end();
  }
}
