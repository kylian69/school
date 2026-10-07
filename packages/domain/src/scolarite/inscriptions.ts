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

type PeriodeStatut = PeriodeDatee & { valeur: StatutApprenant };

/**
 * Section 7 du module 03 : statut « apprenti sans employeur » de `debut` à `fin` (exclue), puis
 * retour en initial, sauf si un nouveau contrat prend effet avant (voir `changerStatut`).
 */
export function ouvrirSansEmployeur(
  periodes: readonly PeriodeStatut[],
  debut: string,
  fin: string,
): PeriodeStatut[] {
  // Une période sans employeur en cours garde son échéance : elle ne se prolonge pas.
  if (periodes.some((p) => p.valeur === 'apprenti_sans_employeur' && couvre(p, debut))) {
    return [...periodes];
  }
  const avec = changerStatut(periodes, 'apprenti_sans_employeur', debut) ?? [...periodes];
  const ouverte = avec.find((p) => p.fin === null);
  if (ouverte?.valeur !== 'apprenti_sans_employeur' || fin <= ouverte.debut) {
    return changerStatut(periodes, 'initial', debut) ?? [...periodes];
  }
  return [
    ...avec.map((p) => (p === ouverte ? { ...p, fin } : p)),
    { debut: fin, fin: null, valeur: 'initial' },
  ];
}

/**
 * RG-03-06 : nouveau statut à une date d'effet. Un retour en initial prévu à l'issue d'une
 * période sans employeur est annulé quand le nouveau statut prend effet pendant cette période
 * (nouveau contrat signé à temps). Sinon, une date antérieure au statut en cours prend effet au
 * début de celui-ci. `null` : rien ne change.
 */
export function changerStatut(
  periodes: readonly PeriodeStatut[],
  statut: StatutApprenant,
  date: string,
): PeriodeStatut[] | null {
  const base = annulerRetourPrevu(periodes, date);
  const enCours = base.find((p) => p.fin === null);
  if (enCours?.valeur === statut) return base.length < periodes.length ? base : null;
  const effet = enCours && date < enCours.debut ? enCours.debut : date;
  const conservees = base
    .filter((p) => p.debut < effet)
    .map((p) => (p.fin === null || p.fin > effet ? { ...p, fin: effet } : p));
  return [...conservees, { debut: effet, fin: null, valeur: statut }];
}

/**
 * Le retour en initial prévu à l'issue d'une période sans employeur s'annule pour un statut qui
 * prend effet pendant cette période : la période sans employeur redevient la période en cours.
 */
export function annulerRetourPrevu(
  periodes: readonly PeriodeStatut[],
  date: string,
): PeriodeStatut[] {
  const ouverte = periodes.find((p) => p.fin === null);
  const sansEmployeur =
    ouverte &&
    date < ouverte.debut &&
    periodes.find(
      (p) => p.valeur === 'apprenti_sans_employeur' && p.fin === ouverte.debut && p.debut <= date,
    );
  if (!sansEmployeur) return [...periodes];
  return periodes
    .filter((p) => p !== ouverte)
    .map((p) => (p === sansEmployeur ? { ...p, fin: null } : p));
}

/**
 * Passage à l'année suivante : le statut du jour est reconduit au début de la nouvelle promotion ;
 * une période sans employeur garde son échéance, puis l'apprenant repasse en initial.
 */
export function statutsReconduits(
  periodes: readonly PeriodeStatut[],
  date: string,
  debut: string,
): PeriodeStatut[] {
  const courante = periodes.find((p) => couvre(p, date)) ?? periodes.at(-1);
  if (courante?.valeur === 'apprenti_sans_employeur' && courante.fin !== null) {
    return courante.fin > debut
      ? ouvrirSansEmployeur([], debut, courante.fin)
      : [{ debut, fin: null, valeur: 'initial' }];
  }
  return [{ debut, fin: null, valeur: courante?.valeur ?? 'initial' }];
}

/** Valeur en vigueur à une date (statut d'un apprenant, groupe d'un type). */
export function valeurA<T>(periodes: readonly (PeriodeDatee & { valeur: T })[], date: string) {
  return periodes.find((p) => couvre(p, date))?.valeur ?? null;
}
