import { describe, expect, it } from 'vitest';
import { avertissementsMaquette, heuresVides, totauxMaquette, type Maquette } from './maquette.js';
import {
  prochainNumero,
  verifierModificationVersion,
  verifierPublication,
  versionDeReference,
} from './versions.js';

const heures = (cm: number, td = 0, tp = 0) => ({ ...heuresVides(), cm, td, tp });

const UE1 = {
  id: 'u1',
  code: 'UE1',
  blocId: 'b1' as string | null,
  annee: 1,
  semestre: 1,
  ects: 18,
  coefficient: 3,
  option: null,
};
const UE2 = { ...UE1, id: 'u2', code: 'UE2', blocId: null, ects: 12, coefficient: 2 };
const M1 = { id: 'm1', code: 'M1', ueId: 'u1', coefficient: 1, heures: heures(10.5, 20) };
const M2 = { id: 'm2', code: 'M2', ueId: 'u1', coefficient: 2, heures: heures(0, 10, 15.25) };

const maquette: Maquette = {
  blocs: [{ id: 'b1', code: 'BC1' }],
  ues: [
    {
      id: 'u1',
      code: 'UE1',
      blocId: 'b1',
      annee: 1,
      semestre: 1,
      ects: 18,
      coefficient: 3,
      option: null,
    },
    {
      id: 'u2',
      code: 'UE2',
      blocId: null,
      annee: 1,
      semestre: 1,
      ects: 12,
      coefficient: 2,
      option: null,
    },
    {
      id: 'u3',
      code: 'UE3',
      blocId: 'b1',
      annee: 1,
      semestre: 2,
      ects: 27.5,
      coefficient: 3,
      option: null,
    },
    {
      id: 'u4',
      code: 'UE4',
      blocId: null,
      annee: 1,
      semestre: null,
      ects: 0,
      coefficient: 1,
      option: null,
    },
  ],
  modules: [
    { id: 'm1', code: 'M1', ueId: 'u1', coefficient: 1, heures: heures(10.5, 20) },
    { id: 'm2', code: 'M2', ueId: 'u1', coefficient: 2, heures: heures(0, 10, 15.25) },
    { id: 'm3', code: 'M2', ueId: 'u3', coefficient: 1, heures: heures(4) },
    { id: 'm4', code: 'M4', ueId: 'inconnue', coefficient: 1, heures: heures(1) },
  ],
};

describe('RG-02-03 totaux de la maquette', () => {
  const totaux = totauxMaquette(maquette);

  it('additionne les heures par type, par UE et au total', () => {
    expect(totaux.heures).toEqual({ cm: 15.5, td: 30, tp: 15.25, projet: 0, elearning: 0 });
    expect(totaux.heuresTotal).toBe(60.75);
    expect(totaux.ues.u1).toMatchObject({ heuresTotal: 55.75, modules: 2 });
    expect(totaux.ues.u2).toMatchObject({ heuresTotal: 0, modules: 0 });
  });

  it('calcule les ECTS par semestre, par année et par bloc, l’année entière en dernier', () => {
    expect(totaux.ects).toBe(57.5);
    expect(totaux.periodes.map((p) => [p.semestre, p.ects])).toEqual([
      [1, 30],
      [2, 27.5],
      [null, 0],
    ]);
    expect(totaux.annees).toEqual([{ annee: 1, ects: 57.5 }]);
    expect(totaux.blocs.b1).toEqual({ ects: 45.5, heuresTotal: 59.75 });
  });

  it('avertit sans bloquer : semestre hors 30 ECTS, UE sans module, code en double', () => {
    expect(avertissementsMaquette(maquette, 30)).toEqual([
      { type: 'semestre-ects', annee: 1, semestre: 2, ects: 27.5, attendu: 30 },
      { type: 'ue-sans-module', ueId: 'u2', code: 'UE2' },
      { type: 'ue-sans-module', ueId: 'u4', code: 'UE4' },
      { type: 'code-en-double', niveau: 'module', code: 'M2' },
    ]);
  });

  it('ne contrôle pas les ECTS d’une formation qui n’en a pas', () => {
    const sansEcts: Maquette = {
      blocs: [],
      ues: [{ ...UE1, ects: 0, blocId: null }],
      modules: [
        { ...M1, code: '' },
        { ...M2, code: '' },
      ],
    };
    expect(avertissementsMaquette(sansEcts, 30)).toEqual([]);
  });

  it('sépare les ECTS de chaque année de formation', () => {
    const deuxAns = totauxMaquette({
      blocs: [],
      ues: [{ ...UE1, annee: 2 }, UE2],
      modules: [],
    });
    expect(deuxAns.annees).toEqual([
      { annee: 1, ects: 12 },
      { annee: 2, ects: 18 },
    ]);
  });

  it('ignore une UE inconnue pour les totaux de bloc et de période', () => {
    const orpheline = totauxMaquette({
      blocs: [],
      ues: [{ ...UE1, blocId: 'inconnu' }],
      modules: [],
    });
    expect(orpheline.blocs).toEqual({});
    expect(orpheline.periodes[0]?.ects).toBe(18);
  });
});

describe('RG-02-04 versions de maquette', () => {
  it('laisse tout modifier sur un brouillon, sans trace particulière', () => {
    expect(
      verifierModificationVersion({ statut: 'brouillon', utilisee: false }, ['structure']),
    ).toEqual({
      ok: true,
      trace: false,
    });
  });

  it('refuse toute modification d’une version archivée', () => {
    expect(
      verifierModificationVersion({ statut: 'archivee', utilisee: false }, ['libelle']),
    ).toEqual({
      ok: false,
      refus: 'version-archivee',
    });
  });

  it('une version publiée et utilisée garde coefficients, ECTS et règles', () => {
    const utilisee = { statut: 'publiee', utilisee: true } as const;
    expect(verifierModificationVersion(utilisee, ['structure'])).toEqual({
      ok: false,
      refus: 'nouvelle-version-requise',
    });
    expect(verifierModificationVersion(utilisee, ['regles'])).toMatchObject({ ok: false });
    expect(verifierModificationVersion(utilisee, ['libelle', 'heures'])).toEqual({
      ok: true,
      trace: true,
    });
  });

  it('une version publiée non utilisée reste modifiable, avec une trace', () => {
    expect(
      verifierModificationVersion({ statut: 'publiee', utilisee: false }, ['structure']),
    ).toEqual({
      ok: true,
      trace: true,
    });
  });

  it('ne publie qu’un brouillon non vide', () => {
    expect(verifierPublication('brouillon', 3)).toEqual({ ok: true });
    expect(verifierPublication('brouillon', 0)).toEqual({ ok: false, refus: 'maquette-vide' });
    expect(verifierPublication('publiee', 3)).toEqual({ ok: false, refus: 'deja-publiee' });
    expect(verifierPublication('archivee', 3)).toEqual({ ok: false, refus: 'version-archivee' });
  });

  it('numérote les versions et choisit la version de référence (RG-02-20)', () => {
    expect(prochainNumero([])).toBe(1);
    expect(prochainNumero([1, 3, 2])).toBe(4);
    const versions = [
      { numero: 1, statut: 'publiee' },
      { numero: 2, statut: 'publiee' },
      { numero: 3, statut: 'brouillon' },
      { numero: 4, statut: 'archivee' },
    ] as const;
    expect(versionDeReference(versions)?.numero).toBe(2);
    expect(versionDeReference(versions.filter((v) => v.statut !== 'publiee'))?.numero).toBe(3);
    expect(versionDeReference([versions[3]])).toBeNull();
  });
});
