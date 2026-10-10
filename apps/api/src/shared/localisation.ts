import type { LocalisationEtablissement } from '@scolaly/contracts';
import type { etablissement } from '@scolaly/db';

type Colonnes = Pick<
  typeof etablissement.$inferSelect,
  | 'localisationActive'
  | 'localisationLatitude'
  | 'localisationLongitude'
  | 'localisationRayon'
  | 'localisationPlagesIp'
>;

/** RG-06-10 : périmètre de localisation d'un établissement. */
export const localisationEtablissement = (e: Colonnes): LocalisationEtablissement => ({
  active: e.localisationActive,
  latitude: e.localisationLatitude,
  longitude: e.localisationLongitude,
  rayonMetres: e.localisationRayon,
  plagesIp: e.localisationPlagesIp,
});

/** Colonnes enregistrées pour un périmètre saisi (plages sans doublon). */
export const colonnesLocalisation = (l: LocalisationEtablissement) => ({
  localisationActive: l.active,
  localisationLatitude: l.latitude,
  localisationLongitude: l.longitude,
  localisationRayon: l.rayonMetres,
  localisationPlagesIp: [...new Set(l.plagesIp)],
});
