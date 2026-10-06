/**
 * Maquette d'une formation (module 02, RG-02-02 et RG-02-03) : un arbre à trois niveaux au plus,
 * bloc de compétences (facultatif) → UE → module. Les UE portent ECTS et coefficient, les modules
 * un coefficient et des volumes horaires par type.
 */
export const TYPES_HEURES = ['cm', 'td', 'tp', 'projet', 'elearning'] as const;
export type TypeHeures = (typeof TYPES_HEURES)[number];
export type Heures = Record<TypeHeures, number>;

export interface BlocMaquette {
  id: string;
  code: string;
}

export interface UeMaquette {
  id: string;
  code: string;
  blocId: string | null;
  /** Année de formation (1re, 2e…). */
  annee: number;
  /** Semestre dans l'année (1 ou 2) ; null pour une UE annuelle. */
  semestre: number | null;
  ects: number;
  coefficient: number;
  /** RG-02-15 : option à laquelle l'UE appartient ; null si elle est suivie par tous. */
  option: string | null;
}

export interface ModuleMaquette {
  id: string;
  code: string;
  ueId: string;
  coefficient: number;
  heures: Heures;
}

export interface Maquette {
  blocs: readonly BlocMaquette[];
  ues: readonly UeMaquette[];
  modules: readonly ModuleMaquette[];
}

export const heuresVides = (): Heures => ({ cm: 0, td: 0, tp: 0, projet: 0, elearning: 0 });

/** Somme sans erreur d'arrondi visible (ECTS et heures ont au plus deux décimales). */
const ajouter = (a: number, b: number) => Math.round((a + b) * 100) / 100;

function cumuler(total: Heures, heures: Heures): Heures {
  const resultat = { ...total };
  for (const type of TYPES_HEURES) resultat[type] = ajouter(resultat[type], heures[type]);
  return resultat;
}

const totalHeures = (heures: Heures) => TYPES_HEURES.reduce((s, t) => ajouter(s, heures[t]), 0);

/** Période d'une UE : un semestre d'une année, ou l'année entière. */
export interface PeriodeMaquette {
  annee: number;
  semestre: number | null;
}

export const clePeriode = (p: PeriodeMaquette) =>
  p.semestre === null ? `A${String(p.annee)}` : `A${String(p.annee)}-S${String(p.semestre)}`;

export interface TotalPeriode extends PeriodeMaquette {
  ects: number;
  heures: Heures;
}

export interface TotauxMaquette {
  heures: Heures;
  heuresTotal: number;
  ects: number;
  /** Totaux par période, dans l'ordre (année, puis semestre, l'année entière en dernier). */
  periodes: TotalPeriode[];
  /** ECTS par année de formation. */
  annees: { annee: number; ects: number }[];
  /** Totaux par UE (heures de ses modules). */
  ues: Record<string, { heures: Heures; heuresTotal: number; modules: number }>;
  /** Totaux par bloc (ECTS et heures de ses UE). */
  blocs: Record<string, { ects: number; heuresTotal: number }>;
}

/**
 * RG-02-03 : totaux calculés en direct. Les options (RG-02-15) se comptent toutes : la maquette
 * décrit l'offre, pas le parcours d'un apprenant.
 */
export function totauxMaquette(maquette: Maquette): TotauxMaquette {
  let heures = heuresVides();
  for (const module of maquette.modules) heures = cumuler(heures, module.heures);

  const periodes = new Map<string, TotalPeriode>();
  const annees = new Map<number, number>();
  const ues: TotauxMaquette['ues'] = {};
  const blocs: TotauxMaquette['blocs'] = {};
  for (const bloc of maquette.blocs) blocs[bloc.id] = { ects: 0, heuresTotal: 0 };
  let ects = 0;
  for (const ue of maquette.ues) {
    const cle = clePeriode(ue);
    const periode = periodes.get(cle) ?? {
      annee: ue.annee,
      semestre: ue.semestre,
      ects: 0,
      heures: heuresVides(),
    };
    const siens = maquette.modules.filter((m) => m.ueId === ue.id);
    const heuresUe = siens.reduce((total, m) => cumuler(total, m.heures), heuresVides());
    const totalUe = { heures: heuresUe, heuresTotal: totalHeures(heuresUe), modules: siens.length };
    ues[ue.id] = totalUe;
    periode.ects = ajouter(periode.ects, ue.ects);
    periode.heures = cumuler(periode.heures, totalUe.heures);
    periodes.set(cle, periode);
    annees.set(ue.annee, ajouter(annees.get(ue.annee) ?? 0, ue.ects));
    ects = ajouter(ects, ue.ects);
    const bloc = ue.blocId ? blocs[ue.blocId] : undefined;
    if (bloc) {
      bloc.ects = ajouter(bloc.ects, ue.ects);
      bloc.heuresTotal = ajouter(bloc.heuresTotal, totalUe.heuresTotal);
    }
  }
  const ordre = (p: PeriodeMaquette) => p.annee * 100 + (p.semestre ?? 99);
  return {
    heures,
    heuresTotal: totalHeures(heures),
    ects,
    periodes: [...periodes.values()].sort((a, b) => ordre(a) - ordre(b)),
    annees: [...annees.entries()]
      .sort(([a], [b]) => a - b)
      .map(([annee, total]) => ({ annee, ects: total })),
    ues,
    blocs,
  };
}

export type AvertissementMaquette =
  | { type: 'semestre-ects'; annee: number; semestre: number; ects: number; attendu: number }
  | { type: 'ue-sans-module'; ueId: string; code: string }
  | { type: 'code-en-double'; niveau: 'bloc' | 'ue' | 'module'; code: string };

/**
 * Avertissements de l'éditeur, qui ne bloquent jamais : semestre qui ne totalise pas les ECTS
 * attendus (RG-02-03, sauf maquette sans ECTS), UE sans module (cas limite de l'import), codes en
 * double à un même niveau.
 */
export function avertissementsMaquette(
  maquette: Maquette,
  ectsParSemestre: number,
  totaux: TotauxMaquette = totauxMaquette(maquette),
): AvertissementMaquette[] {
  const avertissements: AvertissementMaquette[] = [];
  if (totaux.ects > 0) {
    for (const periode of totaux.periodes) {
      if (periode.semestre !== null && periode.ects !== ectsParSemestre) {
        avertissements.push({
          type: 'semestre-ects',
          annee: periode.annee,
          semestre: periode.semestre,
          ects: periode.ects,
          attendu: ectsParSemestre,
        });
      }
    }
  }
  for (const ue of maquette.ues) {
    if (totaux.ues[ue.id]?.modules === 0) {
      avertissements.push({ type: 'ue-sans-module', ueId: ue.id, code: ue.code });
    }
  }
  const niveaux = [
    ['bloc', maquette.blocs],
    ['ue', maquette.ues],
    ['module', maquette.modules],
  ] as const;
  for (const [niveau, elements] of niveaux) {
    const vus = new Set<string>();
    const signales = new Set<string>();
    for (const { code } of elements) {
      const cle = code.trim().toLowerCase();
      if (cle && vus.has(cle) && !signales.has(cle)) {
        avertissements.push({ type: 'code-en-double', niveau, code });
        signales.add(cle);
      }
      vus.add(cle);
    }
  }
  return avertissements;
}
