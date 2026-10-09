/**
 * Disponibilités déclarées par un intervenant (RG-04-18, US-04-10, écran E-04-07) : créneaux
 * récurrents par jour de semaine, sur une période de validité facultative, et indisponibilités
 * ponctuelles. Contrôles de saisie, sans accès aux données.
 */

/** Créneau récurrent : jour de 1 (lundi) à 7 (dimanche), heures HH:MM, dates AAAA-MM-JJ. */
export interface CreneauSaisi {
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  valableDu?: string | null;
  valableAu?: string | null;
}

/** RG-04-02 : heures et jours ouvrés dans lesquels un créneau doit tenir. */
export interface PlageSaisie {
  debut: string;
  fin: string;
  joursOuvres: readonly number[];
}

export type ErreurCreneau =
  'bornes' | 'periode' | 'jour-non-ouvre' | 'hors-plage' | 'chevauchement';

export interface IndisponibiliteSaisie {
  debut: Date;
  fin: Date;
}

export type ErreurIndisponibilite = 'bornes' | 'passee' | 'trop-longue' | 'chevauchement';

/** Une indisponibilité ponctuelle couvre au plus un an : au-delà, c'est une absence durable. */
export const INDISPONIBILITE_JOURS_MAX = 366;

/** Le créneau s'applique-t-il ce jour (AAAA-MM-JJ) d'après sa période de validité ? */
export const creneauApplicable = (
  c: Pick<CreneauSaisi, 'valableDu' | 'valableAu'>,
  jour: string,
): boolean => (!c.valableDu || c.valableDu <= jour) && (!c.valableAu || jour <= c.valableAu);

/** Deux périodes de validité (bornes ouvertes si absentes) ont-elles un jour commun ? */
const periodesCommunes = (a: CreneauSaisi, b: CreneauSaisi): boolean =>
  (!a.valableDu || !b.valableAu || a.valableDu <= b.valableAu) &&
  (!b.valableDu || !a.valableAu || b.valableDu <= a.valableAu);

/**
 * Erreurs d'un créneau saisi face à la plage de l'établissement et aux créneaux déjà déclarés
 * (sans lui-même). Deux créneaux qui se touchent (12:00 puis 12:00) ne se chevauchent pas.
 */
export function erreursCreneau(
  creneau: CreneauSaisi,
  existants: readonly CreneauSaisi[],
  plage: PlageSaisie,
): ErreurCreneau[] {
  const erreurs: ErreurCreneau[] = [];
  if (creneau.heureFin <= creneau.heureDebut) erreurs.push('bornes');
  if (creneau.valableDu && creneau.valableAu && creneau.valableAu < creneau.valableDu)
    erreurs.push('periode');
  if (!plage.joursOuvres.includes(creneau.jourSemaine)) erreurs.push('jour-non-ouvre');
  if (creneau.heureDebut < plage.debut || creneau.heureFin > plage.fin) erreurs.push('hors-plage');
  if (
    existants.some(
      (e) =>
        e.jourSemaine === creneau.jourSemaine &&
        e.heureDebut < creneau.heureFin &&
        creneau.heureDebut < e.heureFin &&
        periodesCommunes(e, creneau),
    )
  )
    erreurs.push('chevauchement');
  return erreurs;
}

/**
 * Erreurs d'une indisponibilité saisie : bornes, entièrement passée, plus d'un an, ou
 * chevauchant une indisponibilité déjà déclarée (sans elle-même).
 */
export function erreursIndisponibilite(
  indisponibilite: IndisponibiliteSaisie,
  existantes: readonly IndisponibiliteSaisie[],
  maintenant: Date,
): ErreurIndisponibilite[] {
  const { debut, fin } = indisponibilite;
  const erreurs: ErreurIndisponibilite[] = [];
  if (fin.getTime() <= debut.getTime()) erreurs.push('bornes');
  if (fin.getTime() <= maintenant.getTime()) erreurs.push('passee');
  if (fin.getTime() - debut.getTime() > INDISPONIBILITE_JOURS_MAX * 86_400_000)
    erreurs.push('trop-longue');
  if (
    existantes.some((e) => e.debut.getTime() < fin.getTime() && debut.getTime() < e.fin.getTime())
  )
    erreurs.push('chevauchement');
  return erreurs;
}
