/**
 * Contrôle de localisation à l'émargement (RG-06-09, RG-06-10, RGPD-03) : la position du téléphone
 * est comparée au périmètre de l'établissement à la réception du scan, puis jetée ; seul le résultat
 * est conservé. Un refus, une position absente ou trop imprécise ne bloque jamais le scan : le réseau
 * du campus (plages d'adresses IP) est alors vérifié, et à défaut le scan est « à vérifier ».
 */
export type ResultatLocalisation = 'sur-place' | 'hors-site' | 'inconnu';

/** Centre du périmètre (degrés décimaux) et rayon, en mètres. */
export interface PerimetreLocalisation {
  latitude: number;
  longitude: number;
  rayonMetres: number;
}

/** Position transmise par le téléphone ; précision : rayon d'incertitude annoncé, en mètres. */
export interface PositionAppareil {
  latitude: number;
  longitude: number;
  precisionMetres: number;
}

/** Rayon moyen de la Terre (mètres), pour la formule de haversine. */
const RAYON_TERRE_METRES = 6_371_008.8;
const radians = (degres: number) => (degres * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux points, en mètres (haversine). */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Résultat du contrôle. Le réseau du campus suffit à établir la présence sur place. Une position
 * n'est retenue que si sa précision ne dépasse pas le rayon du périmètre ; elle est alors sur place
 * si le cercle d'incertitude touche le périmètre (le doute profite à l'apprenant), hors site sinon.
 * Sans position exploitable ni réseau du campus : inconnu.
 */
export function evaluerLocalisation(entree: {
  perimetre: PerimetreLocalisation | null;
  position: PositionAppareil | null;
  reseauCampus: boolean;
}): ResultatLocalisation {
  if (entree.reseauCampus) return 'sur-place';
  const { perimetre, position } = entree;
  if (!perimetre || !position || position.precisionMetres > perimetre.rayonMetres) {
    return 'inconnu';
  }
  return distanceMetres(perimetre, position) <= perimetre.rayonMetres + position.precisionMetres
    ? 'sur-place'
    : 'hors-site';
}

/** RG-06-09 : un scan hors site ou de position inconnue est signalé à l'intervenant, jamais refusé. */
export const localisationAVerifier = (resultat: ResultatLocalisation | null | undefined) =>
  resultat === 'hors-site' || resultat === 'inconnu';
