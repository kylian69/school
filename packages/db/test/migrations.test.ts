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

  it('une base à jour ne rejoue aucune migration', async () => {
    const database = await upgradeFrom(tags.length);
    await runMigrations(database.migratorUrl);
    expect(await appliedMigrations(database.migratorUrl)).toHaveLength(tags.length);
  });
});
