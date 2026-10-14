/**
 * Séances à distance et hybrides (US-06-06, RG-06-08) : le mode de présence est choisi dans
 * l'emploi du temps (RG-04-01), jamais déduit d'un lien de visio. À distance, l'intervenant partage
 * le QR dans la visio ; l'apprenant qui suit sur le même appareil saisit le code à 6 chiffres, et
 * sa localisation n'est pas contrôlée.
 */
export const MODES_PRESENCE = ['presentiel', 'distanciel', 'hybride'] as const;
export type ModePresence = (typeof MODES_PRESENCE)[number];

/**
 * RG-06-08 : l'apprenant émarge-t-il à distance ? Toujours pour une séance à distance ; pour une
 * séance marquée hybride, quand il le déclare au scan ; jamais en présentiel, même si la séance
 * porte un lien de visio (une déclaration y est ignorée). Un émargement à distance n'est pas soumis
 * au contrôle de localisation.
 */
export function emargementADistance(mode: ModePresence, declareADistance: boolean): boolean {
  if (mode === 'distanciel') return true;
  return mode === 'hybride' && declareADistance;
}
