/**
 * Rythmes d'alternance (RG-03-10 à RG-03-12) et période d'essai (RG-03-08). Un calendrier est une
 * table jour → type ; les dates sont des jours AAAA-MM-JJ, bornes incluses.
 */
export const TYPES_JOUR = ['ecole', 'entreprise', 'ferme', 'examen'] as const;
export type TypeJour = (typeof TYPES_JOUR)[number];

/** Motif d'un modèle : 1 à 4 semaines de 7 jours, du lundi au dimanche. */
export type Motif = readonly (readonly TypeJour[])[];

export type Calendrier = Readonly<Record<string, TypeJour>>;

const E = 'ecole' as const;
const N = 'entreprise' as const;
const F = 'ferme' as const;
const semaine = (jours: readonly TypeJour[]): TypeJour[] => [...jours, F, F];

/** RG-03-10 : les 5 modèles courants fournis par Scolaly (l'école peut en créer d'autres). */
export const MODELES_FOURNIS: readonly { code: string; libelle: string; motif: Motif }[] = [
  {
    code: 'deux-jours-ecole',
    libelle: '2 jours école (lundi, mardi) / 3 jours entreprise',
    motif: [semaine([E, E, N, N, N])],
  },
  {
    code: 'trois-jours-entreprise',
    libelle: '3 jours entreprise / 2 jours école (jeudi, vendredi)',
    motif: [semaine([N, N, N, E, E])],
  },
  {
    code: 'une-semaine-sur-deux',
    libelle: '1 semaine école / 1 semaine entreprise',
    motif: [semaine([E, E, E, E, E]), semaine([N, N, N, N, N])],
  },
  {
    code: 'une-semaine-sur-quatre',
    libelle: '1 semaine école / 3 semaines entreprise',
    motif: [
      semaine([E, E, E, E, E]),
      semaine([N, N, N, N, N]),
      semaine([N, N, N, N, N]),
      semaine([N, N, N, N, N]),
    ],
  },
  {
    code: 'deux-semaines-sur-quatre',
    libelle: '2 semaines école / 2 semaines entreprise',
    motif: [
      semaine([E, E, E, E, E]),
      semaine([E, E, E, E, E]),
      semaine([N, N, N, N, N]),
      semaine([N, N, N, N, N]),
    ],
  },
];

/** Un motif compte 1 à 4 semaines complètes, avec au moins un jour d'école. */
export function verifierMotif(motif: Motif): boolean {
  return (
    motif.length >= 1 &&
    motif.length <= 4 &&
    motif.every((s) => s.length === 7 && s.every((j) => TYPES_JOUR.includes(j))) &&
    motif.some((s) => s.includes('ecole'))
  );
}

const JOUR_MS = 86_400_000;
const versNombre = (jour: string) => Date.parse(`${jour}T00:00:00Z`) / JOUR_MS;
const versJour = (n: number) => new Date(n * JOUR_MS).toISOString().slice(0, 10);

/** Jours de l'intervalle, bornes incluses. */
export function joursEntre(debut: string, fin: string): string[] {
  const liste: string[] = [];
  for (let n = versNombre(debut); n <= versNombre(fin); n++) liste.push(versJour(n));
  return liste;
}

export interface Fermeture {
  dateDebut: string;
  dateFin: string;
  /** Un férié local ferme tout ; des vacances ferment seulement l'école. */
  type: 'ferie' | 'vacances' | 'autre';
}

/**
 * RG-03-11 : calendrier généré d'après un motif, la première semaine du motif étant celle du
 * début. Les jours fériés ferment la journée ; pendant une fermeture de l'école (vacances), un
 * jour d'école devient un jour en entreprise.
 */
export function genererCalendrier(options: {
  debut: string;
  fin: string;
  motif: Motif;
  feries: readonly string[];
  fermetures: readonly Fermeture[];
}): Record<string, TypeJour> {
  const { motif } = options;
  // Lundi de la semaine du début (le 1er janvier 1970, jour 0, est un jeudi).
  const lundi = versNombre(options.debut) - ((versNombre(options.debut) + 3) % 7);
  const feries = new Set(options.feries);
  const calendrier: Record<string, TypeJour> = {};
  for (const jour of joursEntre(options.debut, options.fin)) {
    const ecart = versNombre(jour) - lundi;
    const type = motif[Math.floor(ecart / 7) % motif.length]?.[ecart % 7] ?? 'ferme';
    const fermeture = options.fermetures.find((f) => f.dateDebut <= jour && jour <= f.dateFin);
    if (feries.has(jour) || fermeture?.type === 'ferie') calendrier[jour] = 'ferme';
    else if (fermeture && type === 'ecole') calendrier[jour] = 'entreprise';
    else calendrier[jour] = type;
  }
  return calendrier;
}

export interface ExceptionRythme {
  debut: string;
  fin: string;
  jours: Calendrier;
}

/** RG-03-12 : type du jour pour un apprenant, son exception éventuelle l'emportant. */
export function typeDuJour(
  calendrier: Calendrier | null,
  exceptions: readonly ExceptionRythme[],
  jour: string,
): TypeJour | null {
  const exception = exceptions.find((e) => e.debut <= jour && jour <= e.fin && e.jours[jour]);
  return exception?.jours[jour] ?? calendrier?.[jour] ?? null;
}

/** Nombre de jours de chaque type (légende du calendrier annuel). */
export function compterJours(calendrier: Calendrier): Record<TypeJour, number> {
  const compte: Record<TypeJour, number> = { ecole: 0, entreprise: 0, ferme: 0, examen: 0 };
  for (const type of Object.values(calendrier)) compte[type] += 1;
  return compte;
}

/**
 * RG-03-08 : fin de la période d'essai, au N-ième jour de présence en entreprise à partir du
 * début du contrat, d'après le calendrier de l'apprenant. Null si le calendrier ne va pas assez loin.
 */
export function finPeriodeEssai(options: {
  debut: string;
  fin: string;
  joursEntreprise: number;
  typeDuJour: (jour: string) => TypeJour | null;
}): string | null {
  let compte = 0;
  for (const jour of joursEntre(options.debut, options.fin)) {
    if (options.typeDuJour(jour) === 'entreprise') compte += 1;
    if (compte === options.joursEntreprise) return jour;
  }
  return null;
}
