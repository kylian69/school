/**
 * Contrats d'alternance (RG-03-05 à RG-03-09) et conventions de stage (RG-03-22 à RG-03-24).
 * Dates : jours AAAA-MM-JJ, fin incluse (la fin d'un contrat est son dernier jour).
 */
export const TYPES_CONTRAT = ['apprentissage', 'professionnalisation', 'autre'] as const;
export type TypeContrat = (typeof TYPES_CONTRAT)[number];

export const STATUTS_CONTRAT = ['brouillon', 'signe', 'en_cours', 'termine', 'rompu'] as const;
export type StatutContrat = (typeof STATUTS_CONTRAT)[number];

export const MOTIFS_RUPTURE = [
  'periode_essai',
  'accord_commun',
  'demission',
  'licenciement',
  'autre',
] as const;
export type MotifRupture = (typeof MOTIFS_RUPTURE)[number];

/** RG-03-05 : brouillon → signé → en cours → terminé ou rompu (un contrat signé peut être rompu). */
const SUIVANTS: Record<StatutContrat, readonly StatutContrat[]> = {
  brouillon: ['signe'],
  signe: ['en_cours', 'rompu'],
  en_cours: ['termine', 'rompu'],
  termine: [],
  rompu: [],
};

export const transitionPermise = (de: StatutContrat, vers: StatutContrat) =>
  de === vers || SUIVANTS[de].includes(vers);

/** Un contrat signé ou en cours engage l'apprenant (RG-03-09). */
export const contratActif = (statut: StatutContrat) => statut === 'signe' || statut === 'en_cours';

/** RG-03-06 : statut de l'apprenant qu'entraîne un contrat. */
export function statutDuContrat(type: TypeContrat): 'apprenti' | 'professionnalisation' | null {
  if (type === 'apprentissage') return 'apprenti';
  if (type === 'professionnalisation') return 'professionnalisation';
  return null;
}

export type RefusContrat = 'dates' | 'tuteurs' | 'chevauchement' | 'transition';

const chevauche = (a: { debut: string; fin: string }, b: { debut: string; fin: string }) =>
  a.debut <= b.fin && b.debut <= a.fin;

/**
 * RG-03-05 et RG-03-09 : un contrat finit après son début, a un ou deux tuteurs, et ne chevauche
 * aucun autre contrat signé ou en cours du même apprenant.
 */
export function verifierContrat(options: {
  debut: string;
  fin: string;
  tuteurs: number;
  statut: StatutContrat;
  autres: readonly { debut: string; fin: string; statut: StatutContrat }[];
}): { ok: true } | { ok: false; refus: RefusContrat } {
  if (options.fin < options.debut) return { ok: false, refus: 'dates' };
  if (options.tuteurs < 1 || options.tuteurs > 2) return { ok: false, refus: 'tuteurs' };
  if (
    contratActif(options.statut) &&
    options.autres.some((a) => contratActif(a.statut) && chevauche(a, options))
  ) {
    return { ok: false, refus: 'chevauchement' };
  }
  return { ok: true };
}

/** Ajoute des mois à une date (dernier jour du mois si besoin). */
export function ajouterMois(jour: string, mois: number): string {
  const [annee = 0, m = 1, j = 1] = jour.split('-').map(Number);
  const cible = new Date(Date.UTC(annee, m - 1 + mois, 1));
  const dernier = new Date(
    Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

/**
 * RG-03-07 : la rupture se date entre le début et la fin du contrat. Pour un apprenti qui poursuit
 * sa formation sans employeur, la fin de cette période est calculée (durée de la table datée).
 */
export function verifierRupture(options: {
  debut: string;
  fin: string;
  date: string;
  type: TypeContrat;
  poursuiteSansEmployeur: boolean;
  moisSansEmployeur: number;
}):
  | { ok: true; finSansEmployeur: string | null }
  | { ok: false; refus: 'date-rupture' | 'sans-employeur' } {
  if (options.date < options.debut || options.date > options.fin)
    return { ok: false, refus: 'date-rupture' };
  if (options.poursuiteSansEmployeur && options.type !== 'apprentissage') {
    return { ok: false, refus: 'sans-employeur' };
  }
  return {
    ok: true,
    finSansEmployeur: options.poursuiteSansEmployeur
      ? ajouterMois(options.date, options.moisSansEmployeur)
      : null,
  };
}

// ——— Conventions de stage (RG-03-22, RG-03-23) ———

export const STATUTS_CONVENTION = [
  'brouillon',
  'signee',
  'en_cours',
  'terminee',
  'annulee',
] as const;
export type StatutConvention = (typeof STATUTS_CONVENTION)[number];

/** Brouillon → signée → en cours → terminée ; annulée avant la fin. */
const SUIVANTES: Record<StatutConvention, readonly StatutConvention[]> = {
  brouillon: ['signee', 'annulee'],
  signee: ['en_cours', 'annulee'],
  en_cours: ['terminee', 'annulee'],
  terminee: [],
  annulee: [],
};

export const transitionConventionPermise = (de: StatutConvention, vers: StatutConvention) =>
  de === vers || SUIVANTES[de].includes(vers);

export interface ReglesStage {
  seuilGratificationHeures: number;
  dureeMaximaleMois: number;
  heuresParMois: number;
}

export type ControleStage =
  /** Bloquant sauf dérogation tracée (section 7). */
  | { type: 'gratification-obligatoire'; heures: number; seuil: number }
  | { type: 'gratification-insuffisante'; montant: number; minimum: number }
  | { type: 'duree-maximale'; heures: number; maximum: number };

/**
 * RG-03-23 : contrôles légaux d'une convention, avec les autres stages de l'étudiant sur la même
 * année d'enseignement (tous organismes pour la gratification, même organisme pour la durée).
 * La gratification manquante bloque l'enregistrement ; les autres contrôles sont signalés.
 */
export function controlerStage(options: {
  heuresPresence: number;
  gratificationHoraire: number | null;
  heuresAutresStagesAnnee: number;
  heuresAutresStagesOrganisme: number;
  regles: ReglesStage;
  gratificationMinimale: number;
}): ControleStage[] {
  const { regles } = options;
  const controles: ControleStage[] = [];
  const heuresAnnee = options.heuresPresence + options.heuresAutresStagesAnnee;
  const soumis = heuresAnnee > regles.seuilGratificationHeures;
  if (soumis && !options.gratificationHoraire) {
    controles.push({
      type: 'gratification-obligatoire',
      heures: heuresAnnee,
      seuil: regles.seuilGratificationHeures,
    });
  }
  if (
    soumis &&
    options.gratificationHoraire &&
    options.gratificationHoraire < options.gratificationMinimale
  ) {
    controles.push({
      type: 'gratification-insuffisante',
      montant: options.gratificationHoraire,
      minimum: options.gratificationMinimale,
    });
  }
  const maximum = regles.dureeMaximaleMois * regles.heuresParMois;
  const heuresOrganisme = options.heuresPresence + options.heuresAutresStagesOrganisme;
  if (heuresOrganisme > maximum) {
    controles.push({ type: 'duree-maximale', heures: heuresOrganisme, maximum });
  }
  return controles;
}

export const bloquant = (controle: ControleStage) => controle.type === 'gratification-obligatoire';
