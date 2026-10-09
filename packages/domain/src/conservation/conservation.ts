/**
 * Durées de conservation (RGPD-04) : les durées vivent dans packages/referentials (table datée
 * `durees-conservation`, durée ISO 8601) ; ce calcul en tire la date limite d'une purge.
 */

/** Durée ISO 8601 limitée aux années, mois, semaines et jours (P5Y, P12M, P2W, P0D). */
const DUREE = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/;
const JOUR_MS = 86_400_000;

/**
 * Instant `duree` avant `maintenant`, en calendrier UTC. Un jour absent du mois d'arrivée
 * (31 mars moins un mois) est ramené au dernier jour de ce mois : la limite la plus ancienne, qui
 * n'efface jamais une donnée avant son échéance.
 */
export function reculerDuree(maintenant: Date, duree: string): Date {
  const parties = duree === 'P' ? null : DUREE.exec(duree);
  if (!parties) {
    throw new RangeError(
      `Durée de conservation « ${duree} » invalide : format attendu P…Y…M…W…D (ISO 8601).`,
    );
  }
  // Une partie absente vaut undefined à l'exécution, malgré le type string[] de la capture.
  const [ans, mois, semaines, jours] = parties.slice(1).map((v) => (v ? Number(v) : 0)) as [
    number,
    number,
    number,
    number,
  ];
  const total = maintenant.getUTCFullYear() * 12 + maintenant.getUTCMonth() - (ans * 12 + mois);
  const annee = Math.floor(total / 12);
  const moisArrivee = total - annee * 12;
  const dernierJour = new Date(Date.UTC(annee, moisArrivee + 1, 0)).getUTCDate();
  const recule = new Date(maintenant);
  recule.setUTCFullYear(annee, moisArrivee, Math.min(maintenant.getUTCDate(), dernierJour));
  return new Date(recule.getTime() - (semaines * 7 + jours) * JOUR_MS);
}

/**
 * Échéance atteinte : l'événement de départ (fin de la période, sortie…) date d'au moins la
 * durée de conservation. Une durée nulle (P0D) est atteinte dès l'événement.
 */
export function conservationEchue(evenement: Date, maintenant: Date, duree: string): boolean {
  return evenement <= reculerDuree(maintenant, duree);
}
