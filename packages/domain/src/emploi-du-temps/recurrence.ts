import type { Intervalle } from '../calendrier/annee.js';

/**
 * Séances récurrentes (US-04-02 ; RG-04-02 à RG-04-04). Les jours sont des jours civils
 * AAAA-MM-JJ, les heures des heures locales HH:MM dans le fuseau de l'établissement ; chaque
 * occurrence est convertie en instants UTC, sans décalage au changement d'heure.
 */
export interface RegleRecurrence {
  dateDebut: string;
  dateFin: string;
  /** Jours de la semaine, de 1 (lundi) à 7 (dimanche). */
  joursSemaine: readonly number[];
  /** 1 : chaque semaine ; N : toutes les N semaines, à partir de la semaine du début. */
  intervalleSemaines: number;
  heureDebut: string;
  heureFin: string;
  fuseau: string;
  /** RG-04-03 : sauter les jours en entreprise du rythme d'alternance, si demandé. */
  sauterJoursEntreprise: boolean;
}

export interface ContexteRecurrence {
  /** Fermetures de l'établissement et jours fériés (un jour férié : début = fin). */
  fermetures: readonly Intervalle[];
  /** Jours en entreprise des groupes de la série, d'après leur rythme d'alternance. */
  joursEntreprise?: readonly string[];
  /** Jours retirés à la main de la série. */
  joursExclus?: readonly string[];
}

export type RefusSerie =
  | 'dates-serie'
  | 'duree-serie'
  | 'jours-semaine'
  | 'intervalle'
  | 'heures'
  | 'pas-grille'
  | 'fuseau';

export type VerdictSerie = { ok: true } | { ok: false; refus: RefusSerie };

/** RG-04-02 : pas de la grille, en minutes. */
export const PAS_GRILLE_MINUTES = 15;
/** Garde-fou : une série couvre au plus une année, une semaine sur 52 au plus. */
export const DUREE_MAX_SERIE_JOURS = 366;
export const INTERVALLE_MAX_SEMAINES = 52;

const JOUR_MS = 86_400_000;
const versNombre = (jour: string) => Date.parse(`${jour}T00:00:00Z`) / JOUR_MS;
const versJour = (n: number) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const jourValide = (jour: string) =>
  FORMAT_JOUR.test(jour) && !Number.isNaN(versNombre(jour)) && versJour(versNombre(jour)) === jour;
const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

function fuseauValide(fuseau: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

/** Vérifie une règle de récurrence avant d'en calculer les occurrences. */
export function verifierSerie(regle: RegleRecurrence): VerdictSerie {
  if (!jourValide(regle.dateDebut) || !jourValide(regle.dateFin) || regle.dateFin < regle.dateDebut)
    return { ok: false, refus: 'dates-serie' };
  if (versNombre(regle.dateFin) - versNombre(regle.dateDebut) >= DUREE_MAX_SERIE_JOURS)
    return { ok: false, refus: 'duree-serie' };
  const jours = regle.joursSemaine;
  if (
    jours.length === 0 ||
    new Set(jours).size !== jours.length ||
    !jours.every((j) => Number.isInteger(j) && j >= 1 && j <= 7)
  )
    return { ok: false, refus: 'jours-semaine' };
  const n = regle.intervalleSemaines;
  if (!Number.isInteger(n) || n < 1 || n > INTERVALLE_MAX_SEMAINES)
    return { ok: false, refus: 'intervalle' };
  if (
    !FORMAT_HEURE.test(regle.heureDebut) ||
    !FORMAT_HEURE.test(regle.heureFin) ||
    minutes(regle.heureFin) <= minutes(regle.heureDebut)
  )
    return { ok: false, refus: 'heures' };
  if (
    minutes(regle.heureDebut) % PAS_GRILLE_MINUTES !== 0 ||
    minutes(regle.heureFin) % PAS_GRILLE_MINUTES !== 0
  )
    return { ok: false, refus: 'pas-grille' };
  if (!fuseauValide(regle.fuseau)) return { ok: false, refus: 'fuseau' };
  return { ok: true };
}

/** Écart (en ms) entre l'heure locale du fuseau et l'heure UTC, à un instant donné. */
function decalage(instant: number, fuseau: string): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const v = Object.fromEntries(parties.map((p) => [p.type, p.value]));
  const local = Date.UTC(
    Number(v.year),
    Number(v.month) - 1,
    Number(v.day),
    Number(v.hour),
    Number(v.minute),
    Number(v.second),
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/**
 * Instant UTC d'une heure locale (jour AAAA-MM-JJ, heure HH:MM) dans un fuseau. Une heure qui
 * n'existe pas (passage à l'heure d'été) est décalée de l'écart du changement d'heure.
 */
export function instantLocal(jour: string, heure: string, fuseau: string): Date {
  const mur = versNombre(jour) * JOUR_MS + minutes(heure) * 60_000;
  const premier = decalage(mur, fuseau);
  const second = decalage(mur - premier, fuseau);
  return new Date(mur - (second === premier ? premier : second));
}

export interface Occurrence {
  jour: string;
  debut: Date;
  fin: Date;
}

export type RaisonSaut = 'fermeture' | 'entreprise' | 'exclu';

export interface OccurrencesSerie {
  occurrences: Occurrence[];
  /** Jours de la règle non retenus, avec leur raison, pour l'aperçu avant création. */
  sautees: { jour: string; raison: RaisonSaut }[];
}

/**
 * RG-04-03 : occurrences d'une série (règle vérifiée par verifierSerie). La première semaine
 * est celle du début ; les jours fermés, exclus et, si demandé, en entreprise sont sautés.
 */
export function occurrencesSerie(
  regle: RegleRecurrence,
  contexte: ContexteRecurrence,
): OccurrencesSerie {
  const entreprise = new Set(regle.sauterJoursEntreprise ? (contexte.joursEntreprise ?? []) : []);
  const exclus = new Set(contexte.joursExclus ?? []);
  const joursSemaine = new Set(regle.joursSemaine);
  const debut = versNombre(regle.dateDebut);
  // Lundi de la semaine du début (le 1er janvier 1970, jour 0, est un jeudi).
  const lundi = debut - ((debut + 3) % 7);
  const resultat: OccurrencesSerie = { occurrences: [], sautees: [] };
  for (let n = debut; n <= versNombre(regle.dateFin); n++) {
    const semaine = Math.floor((n - lundi) / 7);
    if (semaine % regle.intervalleSemaines !== 0 || !joursSemaine.has(((n + 3) % 7) + 1)) continue;
    const jour = versJour(n);
    if (exclus.has(jour)) resultat.sautees.push({ jour, raison: 'exclu' });
    else if (contexte.fermetures.some((f) => f.dateDebut <= jour && jour <= f.dateFin))
      resultat.sautees.push({ jour, raison: 'fermeture' });
    else if (entreprise.has(jour)) resultat.sautees.push({ jour, raison: 'entreprise' });
    else
      resultat.occurrences.push({
        jour,
        debut: instantLocal(jour, regle.heureDebut, regle.fuseau),
        fin: instantLocal(jour, regle.heureFin, regle.fuseau),
      });
  }
  return resultat;
}

/** RG-04-03 : une modification s'applique à cette séance, aux suivantes ou à toute la série. */
export type PorteeModification = 'seance' | 'suivantes' | 'serie';

export interface SeanceDeSerie {
  id: string;
  debut: Date;
  serieId: string | null;
}

/** Séances touchées par une modification de la séance cible, selon la portée choisie. */
export function seancesConcernees<T extends SeanceDeSerie>(
  seances: readonly T[],
  cible: T,
  portee: PorteeModification,
): T[] {
  if (portee === 'seance' || cible.serieId === null) return [cible];
  return seances.filter(
    (s) =>
      s.serieId === cible.serieId &&
      (portee === 'serie' || s.debut.getTime() >= cible.debut.getTime()),
  );
}

export type RefusSeance = 'seance-utilisee' | 'motif-requis';
export type VerdictSeance = { ok: true } | { ok: false; refus: RefusSeance };

/** RG-04-04 : une séance avec des présences ou des notes ne se supprime plus ; on l'annule. */
export function verifierSuppressionSeance(usage: {
  presences: number;
  notes: number;
}): VerdictSeance {
  return usage.presences > 0 || usage.notes > 0
    ? { ok: false, refus: 'seance-utilisee' }
    : { ok: true };
}

/** RG-04-04 : une annulation porte un motif. */
export function verifierAnnulationSeance(motif: string | null | undefined): VerdictSeance {
  return motif?.trim() ? { ok: true } : { ok: false, refus: 'motif-requis' };
}
