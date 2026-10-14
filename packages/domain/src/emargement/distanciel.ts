/**
 * Séances à distance et hybrides (US-06-06, RG-06-08) : le mode de présence se déduit de la séance
 * telle que l'emploi du temps la décrit (RG-04-01 : une salle ou un lien de visio, case « séance à
 * distance »). À distance, l'intervenant partage le QR dans la visio ; l'apprenant qui suit sur le
 * même appareil saisit le code à 6 chiffres, et sa localisation n'est pas contrôlée.
 */
export type ModePresence = 'presentiel' | 'distanciel' | 'hybride';

/**
 * Séance à distance : tout le monde suit en visio. Hybride : la séance a lieu en salle (case non
 * cochée) mais porte aussi un lien de visio, que certains apprenants suivent. Sinon : présentiel.
 */
export function modePresence(seance: {
  distanciel: boolean;
  lienVisio: string | null;
}): ModePresence {
  if (seance.distanciel) return 'distanciel';
  return seance.lienVisio ? 'hybride' : 'presentiel';
}

/**
 * RG-06-08 : l'apprenant émarge-t-il à distance ? Toujours pour une séance à distance ; pour une
 * séance hybride, quand il le déclare au scan ; jamais en présentiel (une déclaration y est ignorée).
 * Un émargement à distance n'est pas soumis au contrôle de localisation.
 */
export function emargementADistance(mode: ModePresence, declareADistance: boolean): boolean {
  if (mode === 'distanciel') return true;
  return mode === 'hybride' && declareADistance;
}
