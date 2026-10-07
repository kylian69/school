import { describe, expect, it } from 'vitest';
import { repartir, verifierAjoutMembre, type ApprenantARepartir } from './groupes.js';

const apprenants = (n: number, critere?: (i: number) => string): ApprenantARepartir[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${String(i).padStart(3, '0')}`,
    nom: `Nom${String(n - i).padStart(3, '0')}`,
    prenom: 'Camille',
    ...(critere ? { critere: critere(i) } : {}),
  }));
const groupes = (capacites: (number | null)[], effectifs: number[] = []) =>
  capacites.map((capacite, i) => ({
    id: `g${String(i + 1)}`,
    capacite,
    effectif: effectifs[i] ?? 0,
  }));
const effectifs = (r: ReturnType<typeof repartir>) => {
  const compte = new Map<string, number>();
  for (const a of r.affectations) compte.set(a.groupeId, (compte.get(a.groupeId) ?? 0) + 1);
  return Object.fromEntries([...compte].sort());
};

describe('RG-02-14 appartenance à un groupe', () => {
  const base = {
    groupeDeLaPromotion: true,
    typesActuels: [],
    type: 'td',
    capacite: 2,
    effectif: 0,
    force: false,
  } as const;
  it('accepte un membre dans un groupe de sa promotion avec de la place', () => {
    expect(verifierAjoutMembre(base)).toEqual({ ok: true });
    expect(verifierAjoutMembre({ ...base, capacite: null, effectif: 99 })).toEqual({ ok: true });
  });
  it('refuse un second groupe du même type, un groupe d’une autre promotion, un groupe plein sauf forçage', () => {
    expect(verifierAjoutMembre({ ...base, typesActuels: ['td'] })).toEqual({
      ok: false,
      refus: 'type-deja-pris',
    });
    expect(verifierAjoutMembre({ ...base, typesActuels: ['tp'] })).toEqual({ ok: true });
    expect(verifierAjoutMembre({ ...base, groupeDeLaPromotion: false })).toEqual({
      ok: false,
      refus: 'hors-promotion',
    });
    expect(verifierAjoutMembre({ ...base, effectif: 2 })).toEqual({
      ok: false,
      refus: 'groupe-plein',
    });
    expect(verifierAjoutMembre({ ...base, effectif: 2, force: true })).toEqual({ ok: true });
  });
});

describe('RG-02-16 répartition automatique', () => {
  it('ordre alphabétique : tranches consécutives équilibrées', () => {
    const r = repartir(apprenants(10), groupes([null, null, null]), 'alphabetique');
    expect(effectifs(r)).toEqual({ g1: 4, g2: 3, g3: 3 });
    // Le premier dans l'ordre alphabétique (Nom001, id a009) est dans le premier groupe.
    expect(r.affectations[0]).toEqual({ apprenantId: 'a009', groupeId: 'g1' });
    expect(r.affectations.at(-1)).toEqual({ apprenantId: 'a000', groupeId: 'g3' });
  });

  it('ordre alphabétique : tient compte des présents et des capacités, puis complète', () => {
    const r = repartir(apprenants(6), groupes([2, null], [1, 0]), 'alphabetique');
    expect(effectifs(r)).toEqual({ g1: 1, g2: 5 });
    const plein = repartir(apprenants(5), groupes([2, 2]), 'alphabetique');
    expect(effectifs(plein)).toEqual({ g1: 2, g2: 2 });
    expect(plein.nonAffectes).toHaveLength(1);
    expect(repartir(apprenants(2), [], 'alphabetique').nonAffectes).toHaveLength(2);
  });

  it('équilibrage des effectifs, présents compris, avec capacité', () => {
    const r = repartir(apprenants(7), groupes([null, null, 2], [3, 0, 0]), 'equilibre');
    expect(effectifs(r)).toEqual({ g1: 1, g2: 4, g3: 2 });
  });

  it('équilibrage selon un critère : chaque groupe a autant de chaque valeur', () => {
    const r = repartir(
      apprenants(8, (i) => (i % 2 ? 'apprenti' : 'initial')),
      groupes([null, null]),
      'critere',
    );
    const apprentis = r.affectations.filter((a) => Number(a.apprenantId.slice(1)) % 2 === 1);
    expect(apprentis.filter((a) => a.groupeId === 'g1')).toHaveLength(2);
    expect(effectifs(r)).toEqual({ g1: 4, g2: 4 });
    const sansCritere = repartir(apprenants(3), groupes([1, 1]), 'critere');
    expect(sansCritere.nonAffectes).toHaveLength(1);
  });

  it('critère d’acceptation : 120 apprenants en 4 groupes en moins d’une seconde', () => {
    const debut = performance.now();
    const r = repartir(apprenants(120), groupes([null, null, null, null]), 'equilibre');
    expect(performance.now() - debut).toBeLessThan(1000);
    expect(effectifs(r)).toEqual({ g1: 30, g2: 30, g3: 30, g4: 30 });
  });

  it('départage les homonymes par prénom puis identifiant', () => {
    const memes = [
      { id: 'b', nom: 'Martin', prenom: 'Léa' },
      { id: 'a', nom: 'Martin', prenom: 'Léa' },
      { id: 'c', nom: 'martin', prenom: 'Ali' },
    ];
    const r = repartir(memes, groupes([null]), 'alphabetique');
    expect(r.affectations.map((a) => a.apprenantId)).toEqual(['c', 'a', 'b']);
  });
});
