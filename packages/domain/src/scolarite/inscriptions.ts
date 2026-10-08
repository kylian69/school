/**
 * Promotions et inscriptions (module 02, RG-02-12, RG-02-13, RG-02-17 ; section 7). Les dates
 * sont des jours AAAA-MM-JJ ; les fins sont exclues, comme pour les attributions de rôles : une
 * sortie datée du jour retire l'apprenant des listes d'appel dès ce jour.
 */
export const ETATS_INSCRIPTION = [
  'preinscrit',
  'inscrit',
  'demissionnaire',
  'exclu',
  'diplome',
] as const;
export type EtatInscription = (typeof ETATS_INSCRIPTION)[number];

export const STATUTS_APPRENANT = [
  'initial',
  'apprenti',
  /** Section 7 du module 03 : apprenti qui cherche un employeur ou poursuit après une rupture. */
  'apprenti_sans_employeur',
  'professionnalisation',
  'formation_continue',
] as const;
export type StatutApprenant = (typeof STATUTS_APPRENANT)[number];

/** Correspondance entre le mode autorisé d'une formation (RG-02-01) et le statut d'un apprenant. */
export const MODE_DU_STATUT: Record<StatutApprenant, string> = {
  initial: 'initial',
  apprenti: 'apprentissage',
  apprenti_sans_employeur: 'apprentissage',
  professionnalisation: 'professionnalisation',
  formation_continue: 'formation_continue',
};

export interface PeriodeDatee {
  debut: string;
  fin: string | null;
}

export const couvre = (periode: PeriodeDatee, date: string) =>
  periode.debut <= date && (periode.fin === null || date < periode.fin);

export type RefusPromotion = 'dates-promotion' | 'annee-hors-duree';

/** RG-02-12 : une promotion finit après son début, sur une année que la formation comporte. */
export function verifierPromotion(promotion: {
  dateDebut: string;
  dateFin: string;
  anneeFormation: number;
  dureeFormation: number;
}): { ok: true } | { ok: false; refus: RefusPromotion } {
  if (promotion.dateFin <= promotion.dateDebut) return { ok: false, refus: 'dates-promotion' };
  if (promotion.anneeFormation < 1 || promotion.anneeFormation > promotion.dureeFormation) {
    return { ok: false, refus: 'annee-hors-duree' };
  }
  return { ok: true };
}

export type RefusInscription =
  | 'entree-hors-promotion'
  | 'sortie-avant-entree'
  | 'statut-non-autorise'
  | 'deja-inscrit'
  | 'sortie-sans-date'
  | 'sortie-sans-motif'
  | 'etat-final';

/**
 * RG-02-13 : l'entrée se situe dans la promotion ; le statut correspond à un mode autorisé de la
 * formation ; un apprenant n'est inscrit qu'une fois à une même promotion (le double cursus passe
 * par deux promotions).
 */
export function verifierInscription(options: {
  dateEntree: string;
  dateSortie: string | null;
  promotion: { dateDebut: string; dateFin: string };
  statut: StatutApprenant;
  modesFormation: readonly string[];
  dejaInscrit: boolean;
}): { ok: true } | { ok: false; refus: RefusInscription } {
  const { promotion } = options;
  if (options.dejaInscrit) return { ok: false, refus: 'deja-inscrit' };
  if (options.dateEntree < promotion.dateDebut || options.dateEntree > promotion.dateFin) {
    return { ok: false, refus: 'entree-hors-promotion' };
  }
  if (options.dateSortie !== null && options.dateSortie <= options.dateEntree) {
    return { ok: false, refus: 'sortie-avant-entree' };
  }
  if (!options.modesFormation.includes(MODE_DU_STATUT[options.statut])) {
    return { ok: false, refus: 'statut-non-autorise' };
  }
  return { ok: true };
}

const ETATS_FINAUX: readonly EtatInscription[] = ['demissionnaire', 'exclu', 'diplome'];

/**
 * RG-02-17 : une sortie (démission, exclusion) ferme l'inscription à sa date, avec un motif ;
 * l'historique reste. Une inscription déjà close ne change plus d'état.
 */
export function verifierSortie(options: {
  etat: EtatInscription;
  nouvelEtat: EtatInscription;
  dateEntree: string;
  dateSortie: string | null;
  motif: string | null;
}): { ok: true } | { ok: false; refus: RefusInscription } {
  if (ETATS_FINAUX.includes(options.etat) && options.nouvelEtat !== options.etat) {
    return { ok: false, refus: 'etat-final' };
  }
  if (options.nouvelEtat === 'demissionnaire' || options.nouvelEtat === 'exclu') {
    if (!options.dateSortie) return { ok: false, refus: 'sortie-sans-date' };
    if (!options.motif?.trim()) return { ok: false, refus: 'sortie-sans-motif' };
  }
  if (options.dateSortie !== null && options.dateSortie <= options.dateEntree) {
    return { ok: false, refus: 'sortie-avant-entree' };
  }
  return { ok: true };
}

/** Une inscription compte dans les listes d'appel à cette date : inscrite, entrée, pas sortie. */
export function inscriptionActive(
  inscription: { etat: EtatInscription; dateEntree: string; dateSortie: string | null },
  date: string,
): boolean {
  return (
    inscription.etat === 'inscrit' &&
    couvre({ debut: inscription.dateEntree, fin: inscription.dateSortie }, date)
  );
}

/**
 * Section 7 : un changement de statut en cours d'année (initial → apprenti) ouvre une nouvelle
 * période à la date de début du contrat ; la période en cours se termine ce jour-là (fin exclue).
 * Une période qui commence le même jour est remplacée.
 */
export function changerPeriode<T extends string>(
  periodes: readonly (PeriodeDatee & { valeur: T })[],
  valeur: T,
  debut: string,
): { ok: true; periodes: (PeriodeDatee & { valeur: T })[] } | { ok: false } {
  const ouverte = periodes.find((p) => p.fin === null);
  if (ouverte && debut < ouverte.debut) return { ok: false };
  if (ouverte?.valeur === valeur) return { ok: true, periodes: [...periodes] };
  const conservees = periodes
    .filter((p) => p.debut < debut)
    .map((p) => (p.fin === null || p.fin > debut ? { ...p, fin: debut } : p));
  return { ok: true, periodes: [...conservees, { debut, fin: null, valeur }] };
}

/**
 * Période de statut d'une inscription. `echeance` : fin de la durée légale d'une période
 * « apprenti sans employeur » (section 7 du module 03), sans effet sur le statut.
 */
export type PeriodeStatut = PeriodeDatee & {
  valeur: StatutApprenant;
  echeance?: string | null;
};

/**
 * Section 7 du module 03 : statut « apprenti sans employeur » à partir de `debut`, avec son
 * échéance légale. Le statut reste tel quel à l'échéance, jusqu'à ce que la scolarité décide
 * (contrat signé, formation initiale ou désistement, RG-09-18) ; l'échéance sert aux alertes.
 */
export function ouvrirSansEmployeur(
  periodes: readonly PeriodeStatut[],
  debut: string,
  echeance: string,
): PeriodeStatut[] {
  // Une période sans employeur en cours garde son échéance : elle ne se prolonge pas.
  const avec = changerStatut(periodes, 'apprenti_sans_employeur', debut);
  if (!avec) return [...periodes];
  return avec.map((p) => (p.fin === null ? { ...p, echeance } : p));
}

/**
 * RG-03-06 : nouveau statut à une date d'effet ; une date antérieure au statut en cours prend
 * effet au début de celui-ci. `null` : rien ne change.
 */
export function changerStatut(
  periodes: readonly PeriodeStatut[],
  statut: StatutApprenant,
  date: string,
): PeriodeStatut[] | null {
  const enCours = periodes.find((p) => p.fin === null);
  if (enCours?.valeur === statut) return null;
  const effet = enCours && date < enCours.debut ? enCours.debut : date;
  const conservees = periodes
    .filter((p) => p.debut < effet)
    .map((p) => (p.fin === null || p.fin > effet ? { ...p, fin: effet } : p));
  return [...conservees, { debut: effet, fin: null, valeur: statut }];
}

/** Échéance de la période « apprenti sans employeur » en vigueur à cette date, sinon `null`. */
export function echeanceSansEmployeur(periodes: readonly PeriodeStatut[], date: string) {
  const courante = periodes.find((p) => couvre(p, date));
  return courante?.valeur === 'apprenti_sans_employeur' ? (courante.echeance ?? null) : null;
}

/**
 * Passage à l'année suivante : le statut du jour est reconduit au début de la nouvelle promotion ;
 * une période sans employeur garde son échéance, même dépassée (la scolarité décide).
 */
export function statutsReconduits(
  periodes: readonly PeriodeStatut[],
  date: string,
  debut: string,
): PeriodeStatut[] {
  const courante = periodes.find((p) => couvre(p, date)) ?? periodes.at(-1);
  if (courante?.valeur === 'apprenti_sans_employeur') {
    return [{ debut, fin: null, valeur: courante.valeur, echeance: courante.echeance ?? null }];
  }
  return [{ debut, fin: null, valeur: courante?.valeur ?? 'initial' }];
}

/** Valeur en vigueur à une date (statut d'un apprenant, groupe d'un type). */
export function valeurA<T>(periodes: readonly (PeriodeDatee & { valeur: T })[], date: string) {
  return periodes.find((p) => couvre(p, date))?.valeur ?? null;
}
