import type { DatedTable } from '../dated-table.js';

/**
 * Rapport de contraste minimal entre un texte de taille courante et son fond (RG-01-24 : la
 * couleur principale d'une école est refusée en dessous). Une couleur principale sert au texte
 * des liens et des boutons : c'est le seuil du texte courant qui s'applique.
 */
export const contrasteMinimal: DatedTable<number> = {
  code: 'contraste-minimal',
  libelle: 'Contraste minimal du texte',
  entries: [
    {
      cle: 'defaut',
      debut: '2019-09-20',
      fin: null,
      source:
        'RGAA 4 (arrêté du 20/09/2019), critère 3.2 ; WCAG 2.1 et 2.2, critère 1.4.3 (rapport de 4,5 pour 1)',
      valeur: 4.5,
    },
  ],
};
