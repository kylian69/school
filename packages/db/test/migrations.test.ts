import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrate.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

interface Journal {
  entries: { tag: string; when: number }[];
}

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
) as Journal;
const tags = journal.entries.map((entry) => entry.tag);

const temporaryFolders: string[] = [];
const databases: TestDatabase[] = [];

/** Copie des migrations limitée aux `count` premières : l'état d'une version antérieure. */
function migrationsUpTo(count: number): string {
  const folder = mkdtempSync(join(tmpdir(), 'scolaly-migrations-'));
  temporaryFolders.push(folder);
  cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const truncated = { ...journal, entries: journal.entries.slice(0, count) };
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(truncated));
  return folder;
}

async function appliedMigrations(migratorUrl: string): Promise<number[]> {
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ created_at: string }>(
      'select created_at from drizzle.__drizzle_migrations order by id',
    );
    return rows.map((row) => Number(row.created_at));
  } finally {
    await client.end();
  }
}

/** Base migrée jusqu'à la version antérieure `count`, puis mise à jour vers la dernière version. */
async function upgradeFrom(count: number): Promise<TestDatabase> {
  const database = await createTestDatabase(undefined, { migrationsFolder: migrationsUpTo(count) });
  databases.push(database);
  await runMigrations(database.migratorUrl);
  return database;
}

// Migrations qui ajoutent une valeur d'enum : PostgreSQL interdit d'utiliser la nouvelle valeur
// dans la transaction qui l'a ajoutée (« unsafe use of new value »).
const enumAdditions = tags
  .map((tag, index) => ({ tag, index }))
  .filter(({ tag }) =>
    /ADD VALUE/i.test(readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8')),
  );

describe('Migrations depuis une version antérieure', () => {
  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
    for (const folder of temporaryFolders) rmSync(folder, { recursive: true, force: true });
  });

  it('suivent toutes les migrations du dossier (aucune migration hors du journal)', () => {
    const files = readdirSync(MIGRATIONS_FOLDER)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.replace(/\.sql$/, ''));
    expect(files.sort()).toEqual([...tags].sort());
  });

  it('une base d’avant 0042 passe en une fois après 0046 (valeur d’enum ajoutée puis utilisée)', async () => {
    const index = tags.indexOf('0042_apprenti_sans_employeur');
    expect(index).toBeGreaterThan(0);
    const database = await upgradeFrom(index);
    expect(await appliedMigrations(database.migratorUrl)).toEqual(
      journal.entries.map((entry) => entry.when),
    );
  });

  it.each(enumAdditions)('une base d’avant $tag passe à la dernière version', async ({ index }) => {
    const database = await upgradeFrom(index);
    expect(await appliedMigrations(database.migratorUrl)).toHaveLength(tags.length);
  });

  describe('0058 retrait de seance.intervenant_id et de seance_attendu', () => {
    const index = tags.indexOf('0058_retrait_intervenant_seance_attendu');

    /** Base arrêtée juste avant 0058, avec une école, une fiche et une séance sans liaison. */
    async function baseAvant0058(): Promise<{ database: TestDatabase; client: pg.Client }> {
      const database = await createTestDatabase(undefined, {
        migrationsFolder: migrationsUpTo(index),
      });
      databases.push(database);
      const client = new pg.Client({ connectionString: database.migratorUrl });
      await client.connect();
      await client.query(`
        insert into organisation (id, nom, nom_affichage)
          values ('00000000-0000-7000-8000-000000000001', 'École', 'EC');
        insert into personne (id, organisation_id, nom, prenom, email)
          values ('00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000001',
                  'Fictif', 'Ines', 'ines@exemple.test');
        insert into seance (id, organisation_id, libelle, debut, fin, intervenant_id)
          values ('00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000001',
                  'Séance d’une version antérieure', now(), now() + interval '1 hour',
                  '00000000-0000-7000-8000-000000000002')`);
      return { database, client };
    }

    it('reporte l’intervenant des séances sans liaison, une seule fois, puis retire la table', async () => {
      expect(index).toBeGreaterThan(0);
      const { database, client } = await baseAvant0058();
      try {
        // Séance déjà reportée en 0047 (liaison existante) : rien n'est ajouté.
        await client.query(`
          insert into seance (id, organisation_id, libelle, debut, fin, intervenant_id)
            values ('00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000001',
                    'Séance déjà reportée', now(), now() + interval '1 hour',
                    '00000000-0000-7000-8000-000000000002');
          insert into seance_intervenant (id, organisation_id, seance_id, personne_id)
            values ('00000000-0000-7000-8000-000000000006', '00000000-0000-7000-8000-000000000001',
                    '00000000-0000-7000-8000-000000000005', '00000000-0000-7000-8000-000000000002')`);
        await runMigrations(database.migratorUrl);
        const liens = await client.query<{ seance_id: string }>(
          `select seance_id from seance_intervenant order by seance_id`,
        );
        expect(liens.rows.map((r) => r.seance_id)).toEqual([
          '00000000-0000-7000-8000-000000000003',
          '00000000-0000-7000-8000-000000000005',
        ]);
        const restes = await client.query<{ table_name: string | null }>(
          `select to_regclass('public.seance_attendu')::text as table_name`,
        );
        expect(restes.rows[0]?.table_name).toBeNull();
        const vue = await client.query('select count(*) from seance_attendu_calcule');
        expect(vue.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    });

    it('s’arrête sans rien modifier si un attendu saisi un à un serait perdu', async () => {
      const { database, client } = await baseAvant0058();
      try {
        await client.query(`
          insert into seance_attendu (id, organisation_id, seance_id, personne_id)
            values ('00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000001',
                    '00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000002')`);
        await expect(runMigrations(database.migratorUrl)).rejects.toThrow(/Migration 0058 arrêtée/);
        expect(await appliedMigrations(database.migratorUrl)).toHaveLength(index);
        const table = await client.query<{ table_name: string | null }>(
          `select to_regclass('public.seance_attendu')::text as table_name`,
        );
        expect(table.rows[0]?.table_name).toBe('seance_attendu');
      } finally {
        await client.end();
      }
    });
  });

  it('une base à jour ne rejoue aucune migration', async () => {
    const database = await upgradeFrom(tags.length);
    await runMigrations(database.migratorUrl);
    expect(await appliedMigrations(database.migratorUrl)).toHaveLength(tags.length);
  });
});
