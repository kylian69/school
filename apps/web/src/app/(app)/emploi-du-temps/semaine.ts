/**
 * Calculs de la grille de l'emploi du temps (E-04-01) : semaines, heures locales de
 * l'établissement et placement des séances. Les instants sont en UTC ; les jours AAAA-MM-JJ et les
 * heures HH:MM sont lus dans le fuseau de l'établissement.
 */
const JOUR_MS = 86_400_000;

/** RG-04-02 : pas de la grille, en minutes. */
export const PAS_MINUTES = 15;
/** Hauteur d'une heure dans la grille, en pixels (maquette « Emploi du temps — semaine »). */
export const HAUTEUR_HEURE = 56;

const versDate = (jour: string) => new Date(`${jour}T00:00:00Z`);

export const estJour = (valeur: string | undefined): valeur is string =>
  valeur !== undefined &&
  /^\d{4}-\d{2}-\d{2}$/.test(valeur) &&
  !Number.isNaN(versDate(valeur).getTime());

export const ajouterJours = (jour: string, n: number) =>
  new Date(versDate(jour).getTime() + n * JOUR_MS).toISOString().slice(0, 10);

/** Jour de la semaine ISO : lundi = 1 … dimanche = 7. */
export const jourIso = (jour: string) => ((versDate(jour).getUTCDay() + 6) % 7) + 1;

export const lundiDe = (jour: string) => ajouterJours(jour, 1 - jourIso(jour));

/** Numéro de semaine ISO 8601. */
export function numeroSemaine(jour: string): number {
  const jeudi = versDate(ajouterJours(jour, 4 - jourIso(jour)));
  const debutAnnee = Date.UTC(jeudi.getUTCFullYear(), 0, 1);
  return Math.floor((jeudi.getTime() - debutAnnee) / JOUR_MS / 7) + 1;
}

function parties(date: Date, fuseau: string) {
  const valeurs = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: fuseau,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    jour: `${valeurs.year}-${valeurs.month}-${valeurs.day}`,
    minutes: Number(valeurs.hour) * 60 + Number(valeurs.minute),
  };
}

/** Jour et minute depuis minuit d'un instant, dans le fuseau de l'établissement. */
export const partiesLocales = (iso: string, fuseau: string) => parties(new Date(iso), fuseau);

const decalage = (instant: number, fuseau: string) => {
  const { jour, minutes } = parties(new Date(instant), fuseau);
  return versDate(jour).getTime() + minutes * 60_000 - Math.floor(instant / 60_000) * 60_000;
};

/** Instant UTC (ISO) d'un jour et d'une heure locale de l'établissement. */
export function instantLocal(jour: string, heure: string, fuseau: string): string {
  const naif = Date.parse(`${jour}T${heure}:00Z`);
  const essai = naif - decalage(naif, fuseau);
  return new Date(naif - decalage(essai, fuseau)).toISOString();
}

export const heureDe = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const minutesDe = (heure: string) => {
  const [h, m] = heure.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * RG-04-02 : jours et heures pleines affichés par la grille. La plage de l'établissement est
 * élargie à l'heure entière, et aux séances placées en dehors (jour non ouvré compris), pour
 * qu'aucune ne soit masquée.
 */
export function grilleAffichee(
  lundi: string,
  plage: { debut: string; fin: string; joursOuvres: readonly number[] },
  placees: readonly { jour: string; debut: number; fin: number }[],
) {
  const jours = [0, 1, 2, 3, 4, 5, 6]
    .map((n) => ajouterJours(lundi, n))
    .filter(
      (jour) => plage.joursOuvres.includes(jourIso(jour)) || placees.some((p) => p.jour === jour),
    );
  const debut = Math.min(minutesDe(plage.debut), ...placees.map((p) => p.debut));
  const fin = Math.max(minutesDe(plage.fin), ...placees.map((p) => p.fin));
  return {
    jours,
    debut: Math.floor(debut / 60) * 60,
    fin: Math.min(24 * 60, Math.ceil(fin / 60) * 60),
  };
}

/** Arrondi au pas de la grille (RG-04-02). */
export const auPas = (minutes: number) => Math.round(minutes / PAS_MINUTES) * PAS_MINUTES;

export interface Placement {
  id: string;
  debut: number;
  fin: number;
}

/**
 * Colonnes des séances d'un jour qui se chevauchent : chaque séance prend la première colonne
 * libre de son groupe de chevauchement, et connaît le nombre de colonnes de ce groupe.
 */
export function disposer<T extends Placement>(
  seances: readonly T[],
): (T & { colonne: number; colonnes: number })[] {
  const triees = [...seances].sort((a, b) => a.debut - b.debut || b.fin - a.fin);
  const resultat: (T & { colonne: number; colonnes: number })[] = [];
  let paquet: (T & { colonne: number; colonnes: number })[] = [];
  let finPaquet = -1;
  const clore = () => {
    const colonnes = Math.max(1, ...paquet.map((s) => s.colonne + 1));
    for (const s of paquet) s.colonnes = colonnes;
    resultat.push(...paquet);
    paquet = [];
  };
  for (const s of triees) {
    if (s.debut >= finPaquet) clore();
    const occupees = new Set(paquet.filter((p) => p.fin > s.debut).map((p) => p.colonne));
    let colonne = 0;
    while (occupees.has(colonne)) colonne += 1;
    paquet.push({ ...s, colonne, colonnes: 1 });
    finPaquet = Math.max(finPaquet, s.fin);
  }
  clore();
  return resultat;
}

/** Durée lisible : « 12 h », « 1 h 30 », « 45 min ». */
export function formatDuree(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${String(m)} min`;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m).padStart(2, '0')}`;
}

export interface BlocFond {
  nature: 'disponible' | 'indisponible';
  debut: number;
  fin: number;
}

/**
 * RG-04-18 : blocs de fond d'un jour, en minutes depuis minuit : créneaux récurrents de ce jour
 * de la semaine, puis indisponibilités ponctuelles coupées au jour.
 */
export function fondDuJour(
  jour: string,
  disponibilites: {
    creneaux: readonly { jourSemaine: number; heureDebut: string; heureFin: string }[];
    indisponibilites: readonly { debut: string; fin: string }[];
  },
  fuseau: string,
): BlocFond[] {
  const blocs: BlocFond[] = disponibilites.creneaux
    .filter((c) => c.jourSemaine === jourIso(jour))
    .map((c) => ({
      nature: 'disponible',
      debut: minutesDe(c.heureDebut),
      fin: minutesDe(c.heureFin),
    }));
  for (const i of disponibilites.indisponibilites) {
    const debut = partiesLocales(i.debut, fuseau);
    const fin = partiesLocales(i.fin, fuseau);
    if (debut.jour > jour || fin.jour < jour) continue;
    const bloc: BlocFond = {
      nature: 'indisponible',
      debut: debut.jour === jour ? debut.minutes : 0,
      fin: fin.jour === jour ? fin.minutes : 24 * 60,
    };
    if (bloc.fin > bloc.debut) blocs.push(bloc);
  }
  return blocs;
}
