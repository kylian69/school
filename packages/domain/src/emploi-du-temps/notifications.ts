/**
 * Notifications des changements de l'emploi du temps (RG-04-14) : envoi immédiat ou récapitulatif
 * quotidien, regroupement des rafales (RG-08-11) et badge « modifié » dans l'EDT.
 */
import type { StatutSeance } from './conflits.js';

/** RG-04-14 : un changement est signalé aussitôt si la séance a lieu dans les 48 heures. */
export const DELAI_NOTIFICATION_IMMEDIATE_HEURES = 48;

/**
 * RG-08-11 : les changements d'une personne partent en un seul email, 2 minutes après le dernier
 * (publication en lot, modification d'une série), et au plus tard 10 minutes après le premier.
 */
export const ATTENTE_REGROUPEMENT_MINUTES = 2;
export const ATTENTE_REGROUPEMENT_MAX_MINUTES = 10;

/** RG-04-14 : durée par défaut du badge « modifié » (réglage produit, modifiable). */
export const DUREE_BADGE_MODIFIE_JOURS = 7;

const MINUTE = 60_000;

export type NatureNotificationEdt =
  'publication' | 'modification' | 'annulation' | 'report' | 'retrait';

/**
 * RG-04-14 : urgent si l'un des créneaux touchés (l'ancien comme le nouveau, pour un report)
 * n'est pas terminé et commence dans le délai.
 */
export function changementUrgent(
  creneaux: readonly { debut: Date; fin: Date }[],
  maintenant: Date,
  delaiHeures = DELAI_NOTIFICATION_IMMEDIATE_HEURES,
): boolean {
  return creneaux.some(
    (c) =>
      c.fin > maintenant && c.debut.getTime() - maintenant.getTime() <= delaiHeures * 60 * MINUTE,
  );
}

/** RG-08-11 : les changements urgents d'une personne partent quand la rafale est finie. */
export function envoiImmediatDu(
  attente: { premier: Date; dernier: Date },
  maintenant: Date,
): boolean {
  const ecart = (d: Date) => maintenant.getTime() - d.getTime();
  return (
    ecart(attente.dernier) >= ATTENTE_REGROUPEMENT_MINUTES * MINUTE ||
    ecart(attente.premier) >= ATTENTE_REGROUPEMENT_MAX_MINUTES * MINUTE
  );
}

/**
 * Ce qu'on annonce à une personne pour une séance, d'après son état au moment de l'envoi : une
 * séance annulée ou reportée l'est quoi qu'il se soit passé avant ; une personne retirée qui n'y
 * est plus attendue apprend qu'elle n'y participe plus ; une séance publiée dans le lot est
 * nouvelle pour elle, même modifiée ensuite.
 */
export function natureAnnoncee(r: {
  statut: StatutSeance;
  natures: readonly NatureNotificationEdt[];
  /** La personne est encore intervenante ou attendue à la séance. */
  concernee: boolean;
}): NatureNotificationEdt {
  if (r.statut === 'annulee') return 'annulation';
  if (r.statut === 'reportee') return 'report';
  if (!r.concernee) return 'retrait';
  if (r.natures.includes('publication')) return 'publication';
  return 'modification';
}

/** RG-04-14 : badge « modifié » pendant la durée choisie après la dernière modification. */
export function badgeModifie(
  modifieeLe: Date | null,
  maintenant: Date,
  dureeJours = DUREE_BADGE_MODIFIE_JOURS,
): boolean {
  if (!modifieeLe) return false;
  const ecart = maintenant.getTime() - modifieeLe.getTime();
  return ecart >= 0 && ecart < dureeJours * 24 * 60 * MINUTE;
}
