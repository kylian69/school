import {
  effacerLocalisationsEchues,
  purgerIndisponibilites,
  type BilanConservationIndisponibilites,
  type Database,
} from '@scolaly/db';
import { reculerDuree } from '@scolaly/domain';
import { dureesConservation, valueAt } from '@scolaly/referentials';

/**
 * RG-04-18, conservation des indisponibilités : durées en vigueur lues dans packages/referentials
 * (motif effacé à la fin, ligne supprimée ensuite), appliquées école par école.
 */
export async function purgerIndisponibilitesPassees(
  db: Database,
  maintenant = new Date(),
): Promise<BilanConservationIndisponibilites> {
  const jour = maintenant.toISOString().slice(0, 10);
  const duree = (cle: string) => valueAt(dureesConservation, jour, cle).valeur.duree;
  return purgerIndisponibilites(db, {
    motifLimite: reculerDuree(maintenant, duree('indisponibilite-intervenant-motif')),
    ligneLimite: reculerDuree(maintenant, duree('indisponibilite-intervenant')),
  });
}

/**
 * RGPD-03, conservation du résultat du contrôle de localisation : effacé des présences scannées
 * depuis la durée en vigueur (packages/referentials, `presence-localisation`) ; la présence reste.
 */
export function effacerLocalisationsPassees(db: Database, maintenant = new Date()) {
  const jour = maintenant.toISOString().slice(0, 10);
  const { duree } = valueAt(dureesConservation, jour, 'presence-localisation').valeur;
  return effacerLocalisationsEchues(db, reculerDuree(maintenant, duree));
}
