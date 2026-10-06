/**
 * Liste de démarrage (US-01-01, E-01-01) : étapes de configuration, chacune faite d'après les
 * données de l'école, ou marquée faite ou passée par l'administrateur. Elle disparaît quand tout
 * est fait ou passé, et reste accessible depuis les paramètres.
 */
export const ETAPES_DEMARRAGE = ['organisation', 'calendrier', 'apparence', 'roles'] as const;
export type EtapeDemarrage = (typeof ETAPES_DEMARRAGE)[number];

export type ChoixEtape = 'faite' | 'sautee';
export type StatutEtape = 'faite' | 'sautee' | 'a-faire';

/** Constats sur les données de l'école. */
export interface ConstatsDemarrage {
  /** Établissements actifs dont l'adresse est complète (les 5 champs obligatoires). */
  etablissementsComplets: number;
  /** Années scolaires non supprimées (une année a toujours au moins une période). */
  annees: number;
  fermetures: number;
  couleur: boolean;
  logo: boolean;
  /** Personnes qui ont au moins un rôle en cours. */
  personnesAvecRole: number;
}

/** Une étape est faite d'elle-même quand les données de l'école le montrent. */
const FAITE: Record<EtapeDemarrage, (c: ConstatsDemarrage) => boolean> = {
  organisation: (c) => c.etablissementsComplets > 0,
  calendrier: (c) => c.annees > 0 && c.fermetures > 0,
  apparence: (c) => c.couleur || c.logo,
  // L'administrateur seul ne suffit pas : au moins une autre personne a reçu un rôle.
  roles: (c) => c.personnesAvecRole > 1,
};

export interface EtatDemarrage {
  etapes: { code: EtapeDemarrage; statut: StatutEtape; automatique: boolean }[];
  /** Part des étapes faites, en pourcentage entier. */
  avancement: number;
  /** Toutes les étapes sont faites ou passées : la liste n'est plus proposée. */
  termine: boolean;
}

export function etatDemarrage(
  constats: ConstatsDemarrage,
  choix: Partial<Record<EtapeDemarrage, ChoixEtape>>,
): EtatDemarrage {
  const etapes = ETAPES_DEMARRAGE.map((code) => {
    const automatique = FAITE[code](constats);
    const statut: StatutEtape = automatique ? 'faite' : (choix[code] ?? 'a-faire');
    return { code, statut, automatique };
  });
  const faites = etapes.filter((e) => e.statut === 'faite').length;
  return {
    etapes,
    avancement: Math.round((faites / etapes.length) * 100),
    termine: etapes.every((e) => e.statut !== 'a-faire'),
  };
}
