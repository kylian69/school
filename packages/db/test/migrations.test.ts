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

  it('RG-06-08 0065 reprend le mode de présence : seule la case « à distance » compte', async () => {
    const index = tags.indexOf('0065_skinny_nico_minoru');
    expect(index).toBeGreaterThan(0);
    const database = await createTestDatabase(undefined, {
      migrationsFolder: migrationsUpTo(index),
    });
    databases.push(database);
    const client = new pg.Client({ connectionString: database.migratorUrl });
    await client.connect();
    try {
      // À distance ; en salle avec un lien (hybride déduit jusqu'ici) ; sans salle avec un lien.
      await client.query(`
        insert into organisation (id, nom, nom_affichage)
          values ('00000000-0000-7000-8000-000000000001', 'École', 'EC');
        insert into seance (id, organisation_id, libelle, debut, fin, distanciel, lien_visio)
          values
            ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001',
             'À distance', now(), now() + interval '1 hour', true, 'https://visio.exemple.test/a'),
            ('00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000001',
             'Avec lien', now(), now() + interval '1 hour', false, 'https://visio.exemple.test/b'),
            ('00000000-0000-7000-8000-000000000013', '00000000-0000-7000-8000-000000000001',
             'En salle', now(), now() + interval '1 hour', false, null)`);
      await runMigrations(database.migratorUrl);
      const { rows } = await client.query<{ libelle: string; mode_presence: string }>(
        'select libelle, mode_presence from seance order by id',
      );
      expect(rows).toEqual([
        { libelle: 'À distance', mode_presence: 'distanciel' },
        { libelle: 'Avec lien', mode_presence: 'presentiel' },
        { libelle: 'En salle', mode_presence: 'presentiel' },
      ]);
    } finally {
      await client.end();
    }
  });

  it('RG-06-18 0069 reprend les absences des appels validés, sur la dernière version', async () => {
    const index = tags.indexOf('0069_omniscient_gabe_jones');
    expect(index).toBeGreaterThan(0);
    const database = await createTestDatabase(undefined, {
      migrationsFolder: migrationsUpTo(index),
    });
    databases.push(database);
    const client = new pg.Client({ connectionString: database.migratorUrl });
    await client.connect();
    const id = (n: number) => `00000000-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
    const ligne = (
      personne: number,
      statut: string,
      minutes: number | null = null,
      nonAttendu = false,
    ) => ({
      personneId: id(personne),
      statut,
      minutesRetard: minutes,
      nonAttendu,
    });
    try {
      // Établissement à midi ; séance de 9 h à 12 h 30 (heure d'été de Paris) : matin et après-midi.
      await client.query(`
        insert into organisation (id, nom, nom_affichage) values ('${id(1)}', 'École', 'EC');
        insert into etablissement (id, organisation_id, nom, edt_limite_midi)
          values ('${id(2)}', '${id(1)}', 'Campus', '12:00');
        insert into salle (id, organisation_id, etablissement_id, nom)
          values ('${id(3)}', '${id(1)}', '${id(2)}', 'Salle 1');
        insert into personne (id, organisation_id, nom, prenom, email)
          select ('00000000-0000-7000-8000-0000000000' || n)::uuid, '${id(1)}', 'Fictif', 'P' || n,
            'p' || n || '@exemple.test'
          from generate_series(10, 15) n;
        insert into seance (id, organisation_id, libelle, debut, fin, salle_id)
          values ('${id(4)}', '${id(1)}', 'Algorithmique', '2026-10-05T07:00:00Z',
                  '2026-10-05T10:30:00Z', '${id(3)}')`);
      const valider = (version: number, liste: unknown[]) =>
        client.query(
          `insert into appel_validation (id, organisation_id, seance_id, version, valide_par,
             valide_le, adresse_ip, appareil, empreinte, liste, motif)
           values ($1, '${id(1)}', '${id(4)}', $2, '${id(10)}', now(), '192.0.2.1', 'a', 'b', $3, $4)`,
          [id(20 + version), version, JSON.stringify(liste), version === 1 ? null : 'Correction'],
        );
      await valider(1, [ligne(11, 'absent'), ligne(12, 'present')]);
      await valider(2, [
        ligne(11, 'present'),
        ligne(12, 'absent'),
        ligne(13, 'retard', 15),
        ligne(14, 'en-attente', null, true),
        ligne(15, 'a-verifier'),
      ]);
      await runMigrations(database.migratorUrl);
      const { rows } = await client.query<Record<string, unknown>>(
        `select personne_id, nature, minutes, to_char(jour, 'YYYY-MM-DD') as jour, matin,
           apres_midi, statut, version_appel from absence order by personne_id`,
      );
      expect(rows).toEqual([
        {
          personne_id: id(12),
          nature: 'absence',
          minutes: 210,
          jour: '2026-10-05',
          matin: true,
          apres_midi: true,
          statut: 'non-justifiee',
          version_appel: 2,
        },
        {
          personne_id: id(13),
          nature: 'retard',
          minutes: 15,
          jour: '2026-10-05',
          matin: true,
          apres_midi: false,
          statut: 'non-justifiee',
          version_appel: 2,
        },
      ]);
    } finally {
      await client.end();
    }
  });

  it('une base à jour ne rejoue aucune migration', async () => {
    const database = await upgradeFrom(tags.length);
    await runMigrations(database.migratorUrl);
    expect(await appliedMigrations(database.migratorUrl)).toHaveLength(tags.length);
  });
});
