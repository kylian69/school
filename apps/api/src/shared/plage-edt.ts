import type { PlageEdt } from '@scolaly/contracts';
import type { etablissement } from '@scolaly/db';

type Colonnes = Pick<
  typeof etablissement.$inferSelect,
  'edtDebut' | 'edtFin' | 'edtLimiteMidi' | 'edtJoursOuvres'
>;

/** RG-04-02 : plage de l'emploi du temps d'un établissement (heures `time` lues HH:MM:SS). */
export const plageEdt = (e: Colonnes): PlageEdt => ({
  debut: e.edtDebut.slice(0, 5),
  fin: e.edtFin.slice(0, 5),
  limiteMidi: e.edtLimiteMidi.slice(0, 5),
  joursOuvres: [...e.edtJoursOuvres].sort((a, b) => a - b),
});

/** Colonnes enregistrées pour une plage saisie. */
export const colonnesPlageEdt = (p: PlageEdt) => ({
  edtDebut: p.debut,
  edtFin: p.fin,
  edtLimiteMidi: p.limiteMidi,
  edtJoursOuvres: [...new Set(p.joursOuvres)].sort((a, b) => a - b),
});
