import type { DatedTable } from '../dated-table.js';

/**
 * Crédits ECTS attendus par semestre (RG-02-03) : un semestre qui n'en totalise pas autant reçoit
 * un avertissement, sans blocage. 60 crédits par année d'études, soit 30 par semestre.
 */
export const ectsParSemestre: DatedTable<number> = {
  code: 'ects-par-semestre',
  libelle: 'Crédits ECTS attendus par semestre',
  aValider: true,
  entries: [
    {
      cle: 'defaut',
      debut: '2002-04-10',
      fin: null,
      source:
        'Décret n° 2002-482 du 8 avril 2002, article 5 (60 crédits par année d’études) ; arrêté du 22 janvier 2014 fixant le cadre national des formations, article 4',
      valeur: 30,
    },
  ],
};
