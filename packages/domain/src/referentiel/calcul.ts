import {
  validerBlocParCompetences,
  type NiveauMaitrise,
  type ValidationParCompetences,
} from './competences.js';
import { clePeriode, type Maquette, type ModuleMaquette, type UeMaquette } from './maquette.js';
import {
  arrondir,
  mentionPour,
  ORDRE_REGLES,
  trierRegles,
  type CibleRegle,
  type RegleActivee,
  type RegleParticuliere,
  type ReglesValidation,
} from './regles.js';

/**
 * Moteur de calcul des résultats (RG-02-07 à RG-02-10, RG-02-24, RG-02-26, RG-02-27) : le même
 * pour le simulateur et pour les bulletins (module 02, section 9). Il calcule une année de
 * formation pour un apprenant. Les moyennes sont sur 20, arrondies selon la règle de la formation
 * pour l'affichage et les décisions ; les calculs intermédiaires gardent toute leur précision.
 *
 * Règles particulières : à chaque niveau (évaluation, module, UE, moyenne générale), elles
 * s'appliquent dans l'ordre fixe de RG-02-27 (pondérations, plafonds et planchers, pénalités,
 * bonus, points de jury). Une décision vaut null tant qu'il manque des notes (« en attente »).
 */
export interface EvaluationNote {
  moduleId: string;
  /** Type d'évaluation (« controle_continu », « examen », « rattrapage »…), libre. */
  type: string;
  coefficient: number;
  /** Note sur `sur` ; null si l'apprenant n'a pas de note (absence). */
  note: number | null;
  sur: number;
  absence: 'injustifiee' | 'justifiee' | null;
}

export interface PointsJury {
  regleId: string;
  cible: CibleRegle;
  points: number;
  motif: string;
}

export interface DossierApprenant {
  /** RG-02-15 : option suivie ; l'apprenant n'est évalué que sur les UE de son option. */
  option: string | null;
  evaluations: readonly EvaluationNote[];
  /** Bonus non automatiques accordés à l'apprenant (identifiants des règles activées). */
  bonusAccordes: readonly string[];
  pointsJury: readonly PointsJury[];
  /** Niveau retenu de chaque compétence (RG-02-25), par identifiant de compétence. */
  niveauxCompetences: Readonly<Record<string, string | null>>;
}

export interface CompetenceCalcul {
  id: string;
  code: string;
  blocId: string;
}

export interface EntreeCalcul {
  maquette: Maquette;
  /** Année de formation calculée. */
  annee: number;
  competences: readonly CompetenceCalcul[];
  echelle: readonly NiveauMaitrise[];
  regles: ReglesValidation;
  reglesParticulieres: readonly RegleActivee[];
  dossier: DossierApprenant;
}

export type Decision = 'moyenne' | 'compensation';

export interface ResultatModule {
  id: string;
  moyenne: number | null;
  eliminatoire: boolean;
  /** Module bonus (RG-02-26) : hors des moyennes ordinaires. */
  bonus: boolean;
}

export interface ResultatUe {
  id: string;
  moyenne: number | null;
  /** null : en attente de notes. */
  acquise: boolean | null;
  par: Decision | null;
  ects: number;
  eliminatoire: boolean;
  bonus: boolean;
}

export interface ResultatPeriode {
  cle: string;
  semestre: number | null;
  moyenne: number | null;
  validee: boolean | null;
  par: Decision | null;
}

export interface ResultatBloc {
  id: string;
  moyenne: number | null;
  valideParNotes: boolean | null;
  competences: ValidationParCompetences | null;
  valide: boolean | null;
}

export interface Explication {
  regleId: string;
  libelle: string;
  type: RegleParticuliere['type'];
  cible: CibleRegle | { niveau: 'evaluation'; moduleId: string; type: string };
  avant: number;
  apres: number;
}

export interface ResultatCalcul {
  modules: ResultatModule[];
  ues: ResultatUe[];
  periodes: ResultatPeriode[];
  blocs: ResultatBloc[];
  moyenneGenerale: number | null;
  admis: boolean | null;
  mention: string | null;
  ects: number;
  /** RG-02-27 : règles appliquées, expliquées en clair sur le relevé. */
  explications: Explication[];
  /** Saisies ignorées et pourquoi (points de jury sans motif, type d'évaluation non pondéré…). */
  anomalies: string[];
}

const NOTE_MAX = 20;
const borner = (valeur: number, max = NOTE_MAX) => Math.min(max, Math.max(0, valeur));

/** Moyenne pondérée des valeurs connues ; null si aucune n'a de poids. */
function moyennePonderee(elements: readonly { valeur: number | null; poids: number }[]) {
  let somme = 0;
  let poids = 0;
  for (const e of elements) {
    if (e.valeur === null || e.poids <= 0) continue;
    somme += e.valeur * e.poids;
    poids += e.poids;
  }
  return poids > 0 ? somme / poids : null;
}

const memeCible = (a: CibleRegle, b: CibleRegle) =>
  a.niveau === b.niveau && (a.niveau === 'generale' || ('id' in b && a.id === b.id));

export function calculerResultats(entree: EntreeCalcul): ResultatCalcul {
  const { regles, dossier } = entree;
  const arrondi = (v: number) => arrondir(v, regles.arrondi);
  const actives = trierRegles(entree.reglesParticulieres);
  const explications: Explication[] = [];
  const anomalies: string[] = [];
  const notes = regles.modeEvaluation !== 'competences';

  // Périmètre de l'apprenant : l'année calculée et son option (RG-02-15).
  const ues = entree.maquette.ues.filter(
    (u) => u.annee === entree.annee && (u.option === null || u.option === dossier.option),
  );
  const idsUes = new Set(ues.map((u) => u.id));
  const modules = entree.maquette.modules.filter((m) => idsUes.has(m.ueId));

  // UE et modules bonus : calculés, mais retirés des moyennes ordinaires.
  const sourcesBonus = new Set<string>();
  for (const { regle } of actives) {
    if (regle.type === 'ue_bonus') sourcesBonus.add(regle.source.id);
  }
  const estBonus = (m: ModuleMaquette) => sourcesBonus.has(m.id) || sourcesBonus.has(m.ueId);

  /** Bonus, UE bonus et points de jury d'une cible, dans l'ordre de RG-02-27. */
  // Moyennes exactes déjà calculées (modules, puis UE) : sources des UE et modules bonus.
  const sources = new Map<string, number | null>();
  const ajustements = (cible: CibleRegle, valeur: number) => {
    let courante = valeur;
    for (const { id, libelle, regle } of actives) {
      const avant = courante;
      if (regle.type === 'ue_bonus' && memeCible(regle.cible, cible)) {
        const source = sources.get(regle.source.id) ?? null;
        if (source === null || regle.diviseur <= 0) continue;
        courante = borner(courante + Math.max(0, source - regle.seuil) / regle.diviseur);
      } else if (regle.type === 'bonus' && memeCible(regle.cible, cible)) {
        if (!regle.automatique && !dossier.bonusAccordes.includes(id)) continue;
        const ajout = regle.unite === 'points' ? regle.valeur : (courante * regle.valeur) / 100;
        courante = borner(courante + ajout, regle.plafond ?? NOTE_MAX);
      } else if (regle.type === 'points_jury') {
        for (const jury of dossier.pointsJury) {
          if (jury.regleId !== id || !memeCible(jury.cible, cible)) continue;
          courante = appliquerJury(courante, jury, regle, libelle, anomalies);
        }
      } else {
        continue;
      }
      if (courante !== avant) {
        explications.push({
          regleId: id,
          libelle,
          type: regle.type,
          cible,
          avant,
          apres: courante,
        });
      }
    }
    return courante;
  };

  // Évaluations → modules : pondérations, plafonds et planchers, pénalités (RG-02-27).
  const exactesModules = new Map<string, number | null>();
  const resultatsModules: ResultatModule[] = [];
  for (const module of modules) {
    const brute = notes ? moyenneModule(module, dossier.evaluations) : null;
    const ajustee = brute === null ? null : ajustements({ niveau: 'module', id: module.id }, brute);
    exactesModules.set(module.id, ajustee);
    sources.set(module.id, ajustee);
    const moyenne = ajustee === null ? null : arrondi(ajustee);
    resultatsModules.push({
      id: module.id,
      moyenne,
      eliminatoire:
        moyenne !== null && regles.noteEliminatoire !== null && moyenne < regles.noteEliminatoire,
      bonus: estBonus(module),
    });
  }

  function moyenneModule(module: ModuleMaquette, evaluations: readonly EvaluationNote[]) {
    const retenues: { type: string; note: number; coefficient: number }[] = [];
    for (const evaluation of evaluations) {
      if (evaluation.moduleId !== module.id) continue;
      const note = noteEvaluation(module.id, evaluation);
      if (note !== null)
        retenues.push({ type: evaluation.type, note, coefficient: evaluation.coefficient });
    }
    const ponderation = actives.find((r) => r.regle.type === 'ponderation')?.regle;
    if (ponderation?.type !== 'ponderation') {
      return moyennePonderee(retenues.map((e) => ({ valeur: e.note, poids: e.coefficient })));
    }
    const parType = ponderation.poids.map(({ typeEvaluation, poids }) => ({
      valeur: moyennePonderee(
        retenues
          .filter((e) => e.type === typeEvaluation)
          .map((e) => ({ valeur: e.note, poids: e.coefficient })),
      ),
      poids,
    }));
    for (const type of new Set(retenues.map((e) => e.type))) {
      if (!ponderation.poids.some((p) => p.typeEvaluation === type)) {
        anomalies.push(
          `Module ${module.code} : le type d’évaluation « ${type} » n’a pas de poids dans la pondération ; ses notes sont ignorées.`,
        );
      }
    }
    return moyennePonderee(parType);
  }

  function noteEvaluation(moduleId: string, evaluation: EvaluationNote): number | null {
    let note = evaluation.note === null ? null : (evaluation.note * NOTE_MAX) / evaluation.sur;
    for (const { id, libelle, regle } of actives) {
      const cible = { niveau: 'evaluation' as const, moduleId, type: evaluation.type };
      const avant = note;
      if (regle.type === 'plafond' && note !== null && regle.typeEvaluation === evaluation.type) {
        note =
          regle.sens === 'plafond' ? Math.min(note, regle.valeur) : Math.max(note, regle.valeur);
      } else if (
        regle.type === 'penalite_absence' &&
        evaluation.note === null &&
        evaluation.absence === regle.typeAbsence
      ) {
        note = regle.note;
      }
      if (note !== null && note !== avant) {
        explications.push({
          regleId: id,
          libelle,
          type: regle.type,
          cible,
          avant: avant ?? 0,
          apres: note,
        });
      }
    }
    return note;
  }

  // Modules → UE.
  const exactesUes = new Map<string, number | null>();
  const resultatsUes: ResultatUe[] = [];
  const moduleDe = new Map(resultatsModules.map((m) => [m.id, m]));
  for (const ue of ues) {
    const siens = modules.filter((m) => m.ueId === ue.id);
    const comptes = siens.filter((m) => m.coefficient > 0 && !sourcesBonus.has(m.id));
    const brute = moyennePonderee(
      comptes.map((m) => ({ valeur: exactesModules.get(m.id) ?? null, poids: m.coefficient })),
    );
    const exacte = brute === null ? null : ajustements({ niveau: 'ue', id: ue.id }, brute);
    exactesUes.set(ue.id, exacte);
    sources.set(ue.id, exacte);
    const moyenne = exacte === null ? null : arrondi(exacte);
    const resultats = comptes.map((m) => moduleDe.get(m.id));
    const complete = comptes.length > 0 && resultats.every((m) => m?.moyenne != null);
    const eliminatoire = resultats.some((m) => m?.eliminatoire);
    const modulesAuSeuil = resultats.every((m) => (m?.moyenne ?? 0) >= regles.seuil);
    const acquise =
      !complete || moyenne === null
        ? null
        : moyenne >= regles.seuil &&
          !eliminatoire &&
          (regles.compensationModules || modulesAuSeuil);
    resultatsUes.push({
      id: ue.id,
      moyenne,
      acquise,
      par: acquise ? 'moyenne' : null,
      ects: 0,
      eliminatoire,
      bonus: sourcesBonus.has(ue.id),
    });
  }
  const ueDe = new Map(resultatsUes.map((u) => [u.id, u]));
  const ordinaires = ues.filter((u) => !sourcesBonus.has(u.id));

  /** Moyenne d'un ensemble d'UE et état : complet, sans note éliminatoire. */
  const ensemble = (liste: readonly UeMaquette[]) => {
    const exacte = moyennePonderee(
      liste.map((u) => ({ valeur: exactesUes.get(u.id) ?? null, poids: u.coefficient })),
    );
    const resultats = liste.map((u) => ueDe.get(u.id));
    return {
      exacte,
      moyenne: exacte === null ? null : arrondi(exacte),
      complet: liste.length > 0 && resultats.every((u) => u?.acquise != null),
      eliminatoire: resultats.some((u) => u?.eliminatoire),
    };
  };
  const compenser = (liste: readonly UeMaquette[]) => {
    for (const ue of liste) {
      const resultat = ueDe.get(ue.id);
      if (resultat && !resultat.acquise) {
        resultat.acquise = true;
        resultat.par = 'compensation';
      }
    }
  };

  // UE → moyenne générale de l'année, avec ses bonus et points de jury.
  const generale = ensemble(ordinaires);
  const exacteGenerale =
    generale.exacte === null ? null : ajustements({ niveau: 'generale' }, generale.exacte);
  const moyenneGenerale = exacteGenerale === null ? null : arrondi(exacteGenerale);

  // Périodes (semestres, ou l'année pour les UE annuelles) : compensation LMD (RG-02-07).
  const parPeriode = new Map<string, { semestre: number | null; liste: UeMaquette[] }>();
  for (const u of ordinaires) {
    const groupe = parPeriode.get(clePeriode(u)) ?? { semestre: u.semestre, liste: [] };
    groupe.liste.push(u);
    parPeriode.set(clePeriode(u), groupe);
  }
  const periodes = [...parPeriode].sort(([a], [b]) => a.localeCompare(b));
  const resultatsPeriodes: ResultatPeriode[] = periodes.map(([cle, { semestre, liste }]) => {
    const etat = ensemble(liste);
    let validee: boolean | null = null;
    let par: Decision | null = null;
    if (etat.complet) {
      const toutes = liste.every((u) => ueDe.get(u.id)?.acquise);
      const compensable =
        regles.mode === 'lmd' &&
        etat.moyenne !== null &&
        etat.moyenne >= regles.seuil &&
        !etat.eliminatoire;
      validee = toutes || compensable;
      par = toutes ? 'moyenne' : compensable ? 'compensation' : null;
      if (compensable) compenser(liste);
    }
    return { cle, semestre, moyenne: etat.moyenne, validee, par };
  });
  // Option LMD : compensation entre les semestres de l'année, par la moyenne générale.
  if (
    regles.mode === 'lmd' &&
    regles.compensationSemestres &&
    generale.complet &&
    !generale.eliminatoire &&
    moyenneGenerale !== null &&
    moyenneGenerale >= regles.seuil
  ) {
    for (const periode of resultatsPeriodes) {
      if (!periode.validee) {
        periode.validee = true;
        periode.par = 'compensation';
      }
    }
    compenser(ordinaires);
  }

  // Blocs : par les notes (UE compensées dans le bloc), par les compétences, ou les deux.
  const resultatsBlocs: ResultatBloc[] = entree.maquette.blocs.map((bloc) => {
    const liste = ordinaires.filter((u) => u.blocId === bloc.id);
    const etat = ensemble(liste);
    const valideParNotes =
      !notes || !etat.complet || etat.moyenne === null
        ? null
        : etat.moyenne >= regles.seuil && !etat.eliminatoire;
    let competences: ValidationParCompetences | null = null;
    let valide = valideParNotes;
    if (regles.validationBlocs !== 'notes') {
      competences = validerBlocParCompetences(
        entree.competences.filter((c) => c.blocId === bloc.id),
        dossier.niveauxCompetences,
        entree.echelle,
      );
      if (regles.validationBlocs === 'competences') valide = competences.valide;
      else if (valideParNotes !== null) valide = valideParNotes && competences.valide;
    }
    if (regles.mode === 'blocs' && valide) compenser(liste);
    return { id: bloc.id, moyenne: etat.moyenne, valideParNotes, competences, valide };
  });

  // Admission de l'année (RG-02-07).
  let admis: boolean | null;
  if (regles.mode === 'blocs') {
    const horsBloc = ordinaires.filter((u) => u.blocId === null).map((u) => ueDe.get(u.id));
    const decisions = [
      ...resultatsBlocs.map((b) => b.valide),
      ...(notes ? horsBloc.map((u) => u?.acquise ?? null) : []),
    ];
    admis = decisions.includes(false)
      ? false
      : decisions.includes(null)
        ? null
        : decisions.length > 0;
  } else if (regles.mode === 'lmd') {
    const decisions = resultatsPeriodes.map((p) => p.validee);
    admis = decisions.includes(false)
      ? false
      : decisions.includes(null) || decisions.length === 0
        ? null
        : true;
  } else {
    const decisions = ordinaires.map((u) => ueDe.get(u.id)?.acquise ?? null);
    admis = decisions.includes(false)
      ? false
      : decisions.includes(null) || decisions.length === 0
        ? null
        : true;
  }

  // ECTS des UE acquises, directement ou par compensation.
  let ects = 0;
  for (const ue of ues) {
    const resultat = ueDe.get(ue.id);
    if (resultat?.acquise) {
      resultat.ects = ue.ects;
      ects = Math.round((ects + ue.ects) * 100) / 100;
    }
  }

  const rang = (e: Explication) => ORDRE_REGLES.indexOf(e.type);
  return {
    modules: resultatsModules,
    ues: resultatsUes,
    periodes: resultatsPeriodes,
    blocs: resultatsBlocs,
    moyenneGenerale,
    admis,
    mention:
      admis && moyenneGenerale !== null ? mentionPour(moyenneGenerale, regles.mentions) : null,
    ects,
    explications: explications
      .map((e, i) => ({ e, i }))
      .sort((a, b) => rang(a.e) - rang(b.e) || a.i - b.i)
      .map(({ e }) => ({ ...e, avant: arrondi(e.avant), apres: arrondi(e.apres) })),
    anomalies,
  };
}

/**
 * Points de jury (RG-02-26) : au plus le maximum par apprenant, avec un motif obligatoire. Avec des
 * seuils, les points ne servent qu'à atteindre le plus proche seuil accessible, sans le dépasser.
 */
function appliquerJury(
  valeur: number,
  jury: PointsJury,
  regle: Extract<RegleParticuliere, { type: 'points_jury' }>,
  libelle: string,
  anomalies: string[],
): number {
  if (!jury.motif.trim()) {
    anomalies.push(`${libelle} : points de jury ignorés, le motif est obligatoire.`);
    return valeur;
  }
  if (jury.points <= 0) return valeur;
  let points = jury.points;
  if (points > regle.maximum) {
    anomalies.push(
      `${libelle} : ${String(jury.points)} points demandés, ramenés au maximum de ${String(regle.maximum)}.`,
    );
    points = regle.maximum;
  }
  if (regle.seuils.length === 0) return borner(valeur + points);
  const seuil = [...regle.seuils]
    .sort((a, b) => a - b)
    .find((s) => s > valeur && s <= valeur + points);
  if (seuil === undefined) {
    anomalies.push(
      `${libelle} : aucun seuil n’est atteignable avec ces points ; ils ne sont pas ajoutés.`,
    );
    return valeur;
  }
  return seuil;
}
