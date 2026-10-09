import type { Intervalle } from '../calendrier/annee.js';
import { creneauApplicable } from './disponibilites.js';
import { instantLocal, PAS_GRILLE_MINUTES } from './recurrence.js';

/**
 * Conflits de l'emploi du temps (US-04-03 ; RG-04-05 à RG-04-07, RG-03-13, RG-03-24). Les
 * instants sont en UTC ; les jours civils AAAA-MM-JJ et les heures HH:MM sont lus dans le fuseau
 * de l'établissement.
 */
export type StatutSeance = 'brouillon' | 'publiee' | 'annulee' | 'reportee';
export type TypeSeance = 'cm' | 'td' | 'tp' | 'projet' | 'examen';
export type TypeSalle = 'cours' | 'tp_informatique' | 'laboratoire' | 'amphitheatre' | 'virtuelle';

export interface SeancePlanifiee {
  id: string;
  debut: Date;
  fin: Date;
  statut: StatutSeance;
  type: TypeSeance;
  moduleId: string | null;
  salleId: string | null;
  intervenantIds: readonly string[];
  groupeIds: readonly string[];
}

export interface SalleEdt {
  id: string;
  type: TypeSalle;
  capacite: number | null;
  equipements: readonly string[];
  statut: 'disponible' | 'fermee';
}

/** RG-04-18 : indisponibilité ponctuelle d'un intervenant. */
export interface Indisponibilite {
  intervenantId: string;
  debut: Date;
  fin: Date;
}

/** RG-04-18 : créneau de disponibilité récurrent (jour de 1, lundi, à 7, dimanche). */
export interface CreneauDisponibilite {
  intervenantId: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  /** Période de validité (AAAA-MM-JJ, bornes comprises) ; absente : toujours valable. */
  valableDu?: string | null;
  valableAu?: string | null;
}

export interface ContexteConflits {
  fuseau: string;
  /**
   * Séances de la période, brouillons compris, et toutes celles des modules de la séance pour
   * le contrôle de volume ; la séance contrôlée peut y figurer (elle est alors ignorée).
   */
  seances: readonly SeancePlanifiee[];
  apprenantsParGroupe: Readonly<Record<string, readonly string[]>>;
  salles: Readonly<Record<string, SalleEdt>>;
  /** Fermetures de l'établissement et jours fériés (un jour férié : début = fin). */
  fermetures: readonly Intervalle[];
  /** RG-03-13 : jours en entreprise de chaque apprenant, d'après son rythme. */
  joursEntreprise: Readonly<Record<string, readonly string[]>>;
  /** RG-03-24 : périodes de stage de chaque apprenant. */
  stages: Readonly<Record<string, readonly Intervalle[]>>;
  indisponibilites: readonly Indisponibilite[];
  disponibilites: readonly CreneauDisponibilite[];
  /** Volume de la maquette, en minutes, par module et par type (un type absent n'est pas suivi). */
  volumesModules: Readonly<Record<string, Partial<Record<TypeSeance, number>>>>;
}

export type Conflit =
  | { code: 'salle-occupee'; niveau: 'bloquant'; seanceId: string }
  | { code: 'intervenant-occupe'; niveau: 'bloquant'; seanceId: string; intervenantIds: string[] }
  | {
      code: 'groupe-occupe';
      niveau: 'bloquant';
      seanceId: string;
      groupeIds: string[];
      /** Apprenants en séance par un autre groupe que ceux de la séance contrôlée. */
      apprenantIds: string[];
    }
  | { code: 'jour-ferme'; niveau: 'bloquant'; jours: string[] }
  | {
      code: 'jour-entreprise';
      niveau: 'avertissement';
      apprenants: { apprenantId: string; raison: 'entreprise' | 'stage' }[];
      effectif: number;
    }
  | { code: 'capacite-salle'; niveau: 'avertissement'; capacite: number; effectif: number }
  | {
      code: 'intervenant-indisponible';
      niveau: 'avertissement';
      intervenantId: string;
      raison: 'indisponibilite' | 'hors-disponibilites';
    }
  | {
      code: 'volume-module';
      niveau: 'avertissement';
      groupeId: string;
      prevuMinutes: number;
      planifieMinutes: number;
    };

export type CodeConflit = Conflit['code'];

const JOUR_MS = 86_400_000;
const chevauche = (a: { debut: Date; fin: Date }, b: { debut: Date; fin: Date }) =>
  a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime();
const occupe = (s: SeancePlanifiee) => s.statut === 'brouillon' || s.statut === 'publiee';
const duree = (s: { debut: Date; fin: Date }) => (s.fin.getTime() - s.debut.getTime()) / 60_000;
const communs = (a: readonly string[], b: readonly string[]) => a.filter((x) => b.includes(x));

/** Jour civil AAAA-MM-JJ d'un instant dans un fuseau. */
export function jourLocal(instant: Date, fuseau: string): string {
  let format = formatsJour.get(fuseau);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: fuseau });
    formatsJour.set(fuseau, format);
  }
  return format.format(instant);
}
const formatsJour = new Map<string, Intl.DateTimeFormat>();

/** Jours civils couverts par une séance (un seul, sauf séance passant minuit). */
function joursSeance(s: { debut: Date; fin: Date }, fuseau: string): [string, ...string[]] {
  const premier = jourLocal(s.debut, fuseau);
  const dernier = jourLocal(new Date(s.fin.getTime() - 1), fuseau);
  const jours: [string, ...string[]] = [premier];
  for (let n = Date.parse(`${premier}T00:00:00Z`) + JOUR_MS; ; n += JOUR_MS) {
    const jour = new Date(n).toISOString().slice(0, 10);
    if (jour > dernier) return jours;
    jours.push(jour);
  }
}

const jourSemaine = (jour: string) => ((new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const dans = (jour: string, i: Intervalle) => i.dateDebut <= jour && jour <= i.dateFin;

/** Apprenants distincts des groupes d'une séance. */
export function apprenantsSeance(
  groupeIds: readonly string[],
  apprenantsParGroupe: ContexteConflits['apprenantsParGroupe'],
): string[] {
  return [...new Set(groupeIds.flatMap((g) => apprenantsParGroupe[g] ?? []))];
}

/**
 * RG-04-05 : conflits d'une séance créée ou déplacée, par rapport aux autres séances occupant
 * les mêmes ressources (brouillons compris ; annulées et reportées exclues).
 */
export function detecterConflits(seance: SeancePlanifiee, contexte: ContexteConflits): Conflit[] {
  if (!occupe(seance)) return [];
  const conflits: Conflit[] = [];
  const apprenants = apprenantsSeance(seance.groupeIds, contexte.apprenantsParGroupe);
  const salle = seance.salleId === null ? undefined : contexte.salles[seance.salleId];
  // Une salle absente du contexte est contrôlée comme une salle réelle ; seule la visio est partagée.
  const salleReelle = seance.salleId !== null && salle?.type !== 'virtuelle';
  const autres = contexte.seances.filter((s) => s.id !== seance.id && occupe(s));
  const apprenantsCommuns = (groupeIds: readonly string[]) =>
    apprenantsSeance(groupeIds, contexte.apprenantsParGroupe);

  for (const autre of autres.filter((s) => chevauche(s, seance))) {
    if (salleReelle && autre.salleId === seance.salleId)
      conflits.push({ code: 'salle-occupee', niveau: 'bloquant', seanceId: autre.id });
    const intervenantIds = communs(seance.intervenantIds, autre.intervenantIds);
    if (intervenantIds.length > 0)
      conflits.push({
        code: 'intervenant-occupe',
        niveau: 'bloquant',
        seanceId: autre.id,
        intervenantIds,
      });
    const groupeIds = communs(seance.groupeIds, autre.groupeIds);
    const viaCommuns = apprenantsCommuns(groupeIds);
    const parAutreGroupe = communs(
      apprenants,
      apprenantsCommuns(autre.groupeIds.filter((g) => !groupeIds.includes(g))),
    ).filter((a) => !viaCommuns.includes(a));
    if (groupeIds.length > 0 || parAutreGroupe.length > 0)
      conflits.push({
        code: 'groupe-occupe',
        niveau: 'bloquant',
        seanceId: autre.id,
        groupeIds,
        apprenantIds: parAutreGroupe,
      });
  }

  const jours = joursSeance(seance, contexte.fuseau);
  const fermes = jours.filter((j) => contexte.fermetures.some((f) => dans(j, f)));
  if (fermes.length > 0) conflits.push({ code: 'jour-ferme', niveau: 'bloquant', jours: fermes });

  const absents = apprenants.flatMap(
    (apprenantId): { apprenantId: string; raison: 'entreprise' | 'stage' }[] => {
      if (jours.some((j) => contexte.joursEntreprise[apprenantId]?.includes(j)))
        return [{ apprenantId, raison: 'entreprise' }];
      if (jours.some((j) => contexte.stages[apprenantId]?.some((p) => dans(j, p))))
        return [{ apprenantId, raison: 'stage' }];
      return [];
    },
  );
  if (absents.length > 0)
    conflits.push({
      code: 'jour-entreprise',
      niveau: 'avertissement',
      apprenants: absents,
      effectif: apprenants.length,
    });

  if (
    salleReelle &&
    salle !== undefined &&
    salle.capacite !== null &&
    salle.capacite < apprenants.length
  )
    conflits.push({
      code: 'capacite-salle',
      niveau: 'avertissement',
      capacite: salle.capacite,
      effectif: apprenants.length,
    });

  for (const intervenantId of seance.intervenantIds) {
    const raison = raisonIndisponible(intervenantId, seance, jours, contexte);
    if (raison !== null)
      conflits.push({
        code: 'intervenant-indisponible',
        niveau: 'avertissement',
        intervenantId,
        raison,
      });
  }

  const prevu =
    seance.moduleId === null ? undefined : contexte.volumesModules[seance.moduleId]?.[seance.type];
  if (prevu !== undefined)
    for (const groupeId of seance.groupeIds) {
      const planifie = autres
        .filter(
          (s) =>
            s.moduleId === seance.moduleId &&
            s.type === seance.type &&
            s.groupeIds.includes(groupeId),
        )
        .reduce((total, s) => total + duree(s), duree(seance));
      if (planifie > prevu)
        conflits.push({
          code: 'volume-module',
          niveau: 'avertissement',
          groupeId,
          prevuMinutes: prevu,
          planifieMinutes: planifie,
        });
    }

  return conflits;
}

/** RG-04-18 : indisponibilité ponctuelle, ou séance hors des créneaux déclarés disponibles. */
function raisonIndisponible(
  intervenantId: string,
  seance: SeancePlanifiee,
  jours: readonly [string, ...string[]],
  contexte: ContexteConflits,
): 'indisponibilite' | 'hors-disponibilites' | null {
  if (
    contexte.indisponibilites.some((i) => i.intervenantId === intervenantId && chevauche(i, seance))
  )
    return 'indisponibilite';
  const [jour] = jours;
  // Seuls comptent les créneaux valables ce jour : hors de leur période, rien n'est déclaré.
  const creneaux = contexte.disponibilites.filter(
    (d) => d.intervenantId === intervenantId && creneauApplicable(d, jour),
  );
  if (creneaux.length === 0) return null;
  const couverte =
    jours.length === 1 &&
    creneaux.some(
      (c) =>
        c.jourSemaine === jourSemaine(jour) &&
        instantLocal(jour, c.heureDebut, contexte.fuseau).getTime() <= seance.debut.getTime() &&
        seance.fin.getTime() <= instantLocal(jour, c.heureFin, contexte.fuseau).getTime(),
    );
  return couverte ? null : 'hors-disponibilites';
}

/** RG-04-06 : seuls les conflits de salle et de groupe (cours commun) peuvent être forcés. */
export const CONFLITS_FORCABLES = ['salle-occupee', 'groupe-occupe'] as const;

export interface Forcage {
  code: (typeof CONFLITS_FORCABLES)[number];
  /** Séance avec laquelle le conflit est accepté. */
  seanceId: string;
  motif: string;
}

export type RefusForcage = 'non-forcable' | 'motif-requis';

/** RG-04-06 : un forçage porte sur un conflit de salle ou de groupe et donne un motif. */
export function verifierForcage(
  conflit: Conflit,
  motif: string | null | undefined,
): { ok: true; forcage: Forcage } | { ok: false; refus: RefusForcage } {
  if (conflit.code !== 'salle-occupee' && conflit.code !== 'groupe-occupe')
    return { ok: false, refus: 'non-forcable' };
  if (!motif?.trim()) return { ok: false, refus: 'motif-requis' };
  return {
    ok: true,
    forcage: { code: conflit.code, seanceId: conflit.seanceId, motif: motif.trim() },
  };
}

/** Conflits bloquants qui ne sont pas couverts par un forçage. */
export function conflitsBloquants(
  conflits: readonly Conflit[],
  forcages: readonly Forcage[],
): Conflit[] {
  return conflits.filter(
    (c) =>
      c.niveau === 'bloquant' &&
      !forcages.some(
        (f) =>
          (c.code === 'salle-occupee' || c.code === 'groupe-occupe') &&
          f.code === c.code &&
          f.seanceId === c.seanceId,
      ),
  );
}

/** RG-04-06 : un conflit bloquant non forcé empêche la publication, pas le brouillon. */
export function verifierPublicationSeance(
  conflits: readonly Conflit[],
  forcages: readonly Forcage[],
): { ok: true } | { ok: false; refus: 'conflits-bloquants'; conflits: Conflit[] } {
  const restants = conflitsBloquants(conflits, forcages);
  return restants.length === 0
    ? { ok: true }
    : { ok: false, refus: 'conflits-bloquants', conflits: restants };
}

export interface ExigencesSalle {
  type?: TypeSalle;
  equipements?: readonly string[];
}

/**
 * RG-04-07 : salles libres sur le créneau de la séance, ouvertes, de capacité connue et
 * suffisante, du type et avec les équipements demandés ; la plus petite capacité d'abord.
 */
export function sallesLibres(
  seance: SeancePlanifiee,
  contexte: ContexteConflits,
  exigences: ExigencesSalle = {},
): SalleEdt[] {
  const effectif = apprenantsSeance(seance.groupeIds, contexte.apprenantsParGroupe).length;
  const occupees = new Set(
    contexte.seances
      .filter((s) => s.id !== seance.id && occupe(s) && chevauche(s, seance))
      .map((s) => s.salleId),
  );
  return Object.values(contexte.salles)
    .filter(
      (s): s is SalleEdt & { capacite: number } =>
        s.statut === 'disponible' &&
        s.type !== 'virtuelle' &&
        s.capacite !== null &&
        s.capacite >= effectif &&
        (exigences.type === undefined || s.type === exigences.type) &&
        (exigences.equipements ?? []).every((e) => s.equipements.includes(e)) &&
        !occupees.has(s.id),
    )
    .sort((a, b) => a.capacite - b.capacite || a.id.localeCompare(b.id));
}

export interface OptionsCreneaux {
  /** RG-04-02 : plage horaire de l'établissement, en heures locales HH:MM. */
  plageDebut: string;
  plageFin: string;
  /** Jours de la semaine ouverts (1, lundi, à 7, dimanche). */
  joursOuverts: readonly number[];
  /** Nombre de jours recherchés avant et après le jour de la séance. */
  joursRecherche: number;
  nombre: number;
  /** Aucun créneau proposé avant cet instant (en général : maintenant). */
  apres: Date;
}

/** Pas de la grille (RG-04-02), en millisecondes. */
const PAS_MS = PAS_GRILLE_MINUTES * 60_000;

/**
 * RG-04-07 : créneaux de même durée, les plus proches de la séance, où ses groupes et ses
 * intervenants sont libres, hors jours fermés, jours entreprise et indisponibilités ; la salle
 * n'est pas prise en compte (elle se choisit ensuite avec sallesLibres).
 */
export function creneauxLibres(
  seance: SeancePlanifiee,
  contexte: ContexteConflits,
  options: OptionsCreneaux,
): { debut: Date; fin: Date }[] {
  const dureeMs = seance.fin.getTime() - seance.debut.getTime();
  const origine = Date.parse(`${jourLocal(seance.debut, contexte.fuseau)}T00:00:00Z`);
  const ignores = new Set<CodeConflit>(['volume-module']);
  const candidats: { debut: Date; fin: Date }[] = [];
  for (let k = -options.joursRecherche; k <= options.joursRecherche; k++) {
    const jour = new Date(origine + k * JOUR_MS).toISOString().slice(0, 10);
    if (!options.joursOuverts.includes(jourSemaine(jour))) continue;
    const ouverture = instantLocal(jour, options.plageDebut, contexte.fuseau).getTime();
    const fermeture = instantLocal(jour, options.plageFin, contexte.fuseau).getTime();
    for (let t = ouverture; t + dureeMs <= fermeture; t += PAS_MS) {
      if (t < options.apres.getTime() || t === seance.debut.getTime()) continue;
      const deplacee = { ...seance, debut: new Date(t), fin: new Date(t + dureeMs), salleId: null };
      if (detecterConflits(deplacee, contexte).every((c) => ignores.has(c.code)))
        candidats.push({ debut: deplacee.debut, fin: deplacee.fin });
    }
  }
  const ecart = (c: { debut: Date }) => Math.abs(c.debut.getTime() - seance.debut.getTime());
  return candidats
    .sort((a, b) => ecart(a) - ecart(b) || a.debut.getTime() - b.debut.getTime())
    .slice(0, options.nombre);
}
