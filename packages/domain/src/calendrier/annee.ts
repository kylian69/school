import { joursFeries, type JourFerie, type RegleJourFerie } from './jours-feries.js';

/**
 * Année scolaire, périodes et fermetures (US-01-03 ; RG-01-03, RG-01-04, RG-00-05). Les dates sont
 * des jours civils AAAA-MM-JJ, bornes incluses : leur ordre alphabétique est l'ordre du temps.
 */
export interface Intervalle {
  dateDebut: string;
  dateFin: string;
}

export type StatutAnnee = 'preparation' | 'en_cours' | 'cloturee';

export type RefusCalendrier =
  | 'dates-annee'
  | 'aucune-periode'
  | 'dates-periode'
  | 'periode-hors-annee'
  | 'periodes-chevauchement'
  | 'dates-fermeture'
  | 'fermeture-hors-annee'
  | 'annee-cloturee'
  | 'statut-retour'
  | 'annee-utilisee';

export type VerdictCalendrier =
  | { ok: true }
  | {
      ok: false;
      refus: RefusCalendrier;
      /** Rang (à partir de 0) de l'élément en cause. */ rang?: number;
    };

const contient = (conteneur: Intervalle, element: Intervalle) =>
  element.dateDebut >= conteneur.dateDebut && element.dateFin <= conteneur.dateFin;

/**
 * RG-01-03 : l'année a une fin après son début et au moins une période ; chaque période reste
 * dans l'année et aucune ne chevauche une autre. Les fermetures existantes restent dans l'année.
 */
export function verifierAnnee(
  annee: Intervalle,
  periodes: readonly Intervalle[],
  fermetures: readonly Intervalle[] = [],
): VerdictCalendrier {
  if (annee.dateFin <= annee.dateDebut) return { ok: false, refus: 'dates-annee' };
  if (periodes.length === 0) return { ok: false, refus: 'aucune-periode' };
  for (const [rang, periode] of periodes.entries()) {
    if (periode.dateFin < periode.dateDebut) return { ok: false, refus: 'dates-periode', rang };
    if (!contient(annee, periode)) return { ok: false, refus: 'periode-hors-annee', rang };
  }
  const triees = periodes
    .map((periode, rang) => ({ periode, rang }))
    .sort((a, b) => a.periode.dateDebut.localeCompare(b.periode.dateDebut));
  // Triées par début : une période chevauche la précédente si elle commence avant sa fin.
  let finPrecedente = '';
  for (const { periode, rang } of triees) {
    if (periode.dateDebut <= finPrecedente) {
      return { ok: false, refus: 'periodes-chevauchement', rang };
    }
    finPrecedente = periode.dateFin;
  }
  const horsAnnee = fermetures.findIndex((f) => !contient(annee, f));
  if (horsAnnee >= 0) return { ok: false, refus: 'fermeture-hors-annee', rang: horsAnnee };
  return { ok: true };
}

/** Une fermeture (vacances, pont, férié local) se termine après son début, dans l'année. */
export function verifierFermeture(annee: Intervalle, fermeture: Intervalle): VerdictCalendrier {
  if (fermeture.dateFin < fermeture.dateDebut) return { ok: false, refus: 'dates-fermeture' };
  if (!contient(annee, fermeture)) return { ok: false, refus: 'fermeture-hors-annee' };
  return { ok: true };
}

const RANG_STATUT: Record<StatutAnnee, number> = { preparation: 0, en_cours: 1, cloturee: 2 };

/**
 * RG-00-05 : une année clôturée est en lecture seule (sa correction demandera un droit spécifique,
 * tracé). Le statut avance de la préparation à la clôture, sans retour.
 */
export function verifierModificationAnnee(
  statutActuel: StatutAnnee,
  statutDemande?: StatutAnnee,
): VerdictCalendrier {
  if (statutActuel === 'cloturee') return { ok: false, refus: 'annee-cloturee' };
  if (statutDemande && RANG_STATUT[statutDemande] < RANG_STATUT[statutActuel]) {
    return { ok: false, refus: 'statut-retour' };
  }
  return { ok: true };
}

/** Une année ne se supprime qu'en préparation : ensuite, d'autres données s'y rattachent. */
export function verifierSuppressionAnnee(statut: StatutAnnee): VerdictCalendrier {
  return statut === 'preparation' ? { ok: true } : { ok: false, refus: 'annee-utilisee' };
}

/** RG-01-04 : jours fériés compris dans l'intervalle, calculés pour chaque année civile touchée. */
export function joursFeriesEntre(
  intervalle: Intervalle,
  reglesDeLAnnee: (anneeCivile: number) => readonly RegleJourFerie[],
): JourFerie[] {
  const premiere = Number(intervalle.dateDebut.slice(0, 4));
  const derniere = Number(intervalle.dateFin.slice(0, 4));
  const feries: JourFerie[] = [];
  for (let anneeCivile = premiere; anneeCivile <= derniere; anneeCivile++) {
    feries.push(
      ...joursFeries(anneeCivile, reglesDeLAnnee(anneeCivile)).filter((jour) =>
        contient(intervalle, { dateDebut: jour.date, dateFin: jour.date }),
      ),
    );
  }
  return feries;
}
