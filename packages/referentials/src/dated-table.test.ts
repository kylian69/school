import { describe, expect, it } from 'vitest';
import {
  REFERENTIALS,
  ReferentialError,
  validateTable,
  valueAt,
  type DatedTable,
} from './index.js';

const table: DatedTable<number> = {
  code: 'exemple',
  libelle: 'Exemple',
  entries: [
    { cle: 'defaut', debut: '2024-01-01', fin: '2025-01-01', source: 'Texte A', valeur: 1 },
    { cle: 'defaut', debut: '2025-01-01', fin: null, source: 'Texte B', valeur: 2 },
    { cle: 'autre', debut: '2024-06-01', fin: null, source: 'Texte C', valeur: 3 },
  ],
};

describe('valueAt', () => {
  it('renvoie la valeur en vigueur à la date, fin exclue', () => {
    expect(valueAt(table, '2024-12-31').valeur).toBe(1);
    expect(valueAt(table, '2025-01-01').valeur).toBe(2);
    expect(valueAt(table, '2030-05-10').valeur).toBe(2);
  });

  it('sélectionne par clé et garde la source', () => {
    expect(valueAt(table, '2024-07-01', 'autre')).toMatchObject({ valeur: 3, source: 'Texte C' });
  });

  it('explique quoi faire quand aucune valeur ne couvre la date', () => {
    expect(() => valueAt(table, '2023-12-31')).toThrow(/Mettre à jour packages\/referentials/);
    expect(() => valueAt(table, '2024-05-01', 'autre')).toThrow(ReferentialError);
  });

  it('refuse une date mal formée', () => {
    expect(() => valueAt(table, '01/02/2025')).toThrow(/AAAA-MM-JJ/);
    expect(() => valueAt(table, '2025-02-30')).toThrow(/invalide/);
  });
});

describe('validateTable', () => {
  it('accepte une table cohérente', () => {
    expect(validateTable(table)).toEqual([]);
  });

  it('signale dates invalides, source absente, fin avant début et chevauchements', () => {
    const problems = validateTable<number>({
      code: 'fautive',
      libelle: 'Fautive',
      entries: [
        { cle: 'a', debut: '2024-13-01', fin: null, source: 'X', valeur: 0 },
        { cle: 'b', debut: '2024-01-01', fin: '2023-01-01', source: ' ', valeur: 0 },
        { cle: 'b', debut: '2024-01-01', fin: 'bientôt', source: 'Y', valeur: 0 },
        { cle: 'c', debut: '2024-01-01', fin: null, source: 'Z', valeur: 0 },
        { cle: 'c', debut: '2025-01-01', fin: null, source: 'Z', valeur: 0 },
      ],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/fautive\[a 2024-13-01\] : date de début invalide/),
        expect.stringMatching(/fautive\[b 2024-01-01\] : la fin doit être postérieure/),
        expect.stringMatching(/source absente/),
        expect.stringMatching(/date de fin invalide/),
        expect.stringMatching(/fautive\[c\] : périodes qui se chevauchent à partir du 2025-01-01/),
      ]),
    );
  });
});

describe('Tables livrées', () => {
  it.each(REFERENTIALS.map((t) => [t.code, t] as const))(
    '%s est valide et chaque valeur cite sa source',
    (_code, referential) => {
      expect(validateTable(referential)).toEqual([]);
      expect(referential.entries.length).toBeGreaterThan(0);
    },
  );
});
