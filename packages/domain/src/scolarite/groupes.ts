/**
 * Groupes et répartition des apprenants (RG-02-14 à RG-02-16 ; section 7 « groupe plein »).
 */
export const TYPES_GROUPE = ['td', 'tp', 'option', 'langue', 'autre'] as const;
export type TypeGroupe = (typeof TYPES_GROUPE)[number];

export type RefusGroupe = 'type-deja-pris' | 'groupe-plein' | 'hors-promotion';

/**
 * RG-02-14 : un apprenant appartient à un seul groupe d'un même type par promotion ; un groupe
 * plein refuse un membre de plus, sauf forçage par un responsable (tracé par l'appelant).
 */
export function verifierAjoutMembre(options: {
  /** Le groupe est rattaché à la promotion de l'inscription. */
  groupeDeLaPromotion: boolean;
  /** Types des groupes dont l'inscription est déjà membre à la date d'effet. */
  typesActuels: readonly TypeGroupe[];
  type: TypeGroupe;
  capacite: number | null;
  effectif: number;
  force: boolean;
}): { ok: true } | { ok: false; refus: RefusGroupe } {
  if (!options.groupeDeLaPromotion) return { ok: false, refus: 'hors-promotion' };
  if (options.typesActuels.includes(options.type)) return { ok: false, refus: 'type-deja-pris' };
  if (options.capacite !== null && options.effectif >= options.capacite && !options.force) {
    return { ok: false, refus: 'groupe-plein' };
  }
  return { ok: true };
}

export const METHODES_REPARTITION = ['alphabetique', 'equilibre', 'critere'] as const;
export type MethodeRepartition = (typeof METHODES_REPARTITION)[number];

export interface ApprenantARepartir {
  id: string;
  nom: string;
  prenom: string;
  /** Valeur du critère d'équilibrage (statut, option…) pour la méthode « critere ». */
  critere?: string;
}

export interface GroupeARemplir {
  id: string;
  capacite: number | null;
  /** Membres déjà présents, comptés dans la capacité et l'équilibre. */
  effectif: number;
}

export interface Repartition {
  affectations: { apprenantId: string; groupeId: string }[];
  /** Apprenants sans place, faute de capacité. */
  nonAffectes: string[];
}

const comparerNoms = (a: ApprenantARepartir, b: ApprenantARepartir) =>
  a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) ||
  a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' }) ||
  a.id.localeCompare(b.id);

/**
 * RG-02-16 : répartition automatique, à retoucher ensuite à la main.
 * - « alphabetique » : par ordre alphabétique, en tranches consécutives de tailles équilibrées ;
 * - « equilibre » : effectifs égalisés (chaque apprenant va au groupe le moins rempli) ;
 * - « critere » : comme « equilibre », mais chaque valeur du critère est répartie à son tour, pour
 *   que chaque groupe en compte autant.
 * La capacité de chaque groupe est toujours respectée.
 */
export function repartir(
  apprenants: readonly ApprenantARepartir[],
  groupes: readonly GroupeARemplir[],
  methode: MethodeRepartition,
): Repartition {
  const etat = groupes.map((g) => ({ ...g, ajoutes: 0 }));
  const place = (g: (typeof etat)[number]) =>
    g.capacite === null || g.effectif + g.ajoutes < g.capacite;
  const resultat: Repartition = { affectations: [], nonAffectes: [] };
  const placer = (apprenant: ApprenantARepartir, groupe: (typeof etat)[number] | undefined) => {
    if (!groupe) {
      resultat.nonAffectes.push(apprenant.id);
      return;
    }
    groupe.ajoutes += 1;
    resultat.affectations.push({ apprenantId: apprenant.id, groupeId: groupe.id });
  };
  const moinsRempli = () =>
    etat
      .filter(place)
      .reduce<(typeof etat)[number] | undefined>(
        (choix, g) =>
          !choix || g.effectif + g.ajoutes < choix.effectif + choix.ajoutes ? g : choix,
        undefined,
      );
  const tries = [...apprenants].sort(comparerNoms);

  if (methode === 'alphabetique') {
    // Tailles cibles : le total (présents compris) partagé au mieux, dans la limite des capacités ;
    // chaque groupe reçoit ensuite une tranche consécutive de la liste alphabétique.
    const total = tries.length + etat.reduce((s, g) => s + g.effectif, 0);
    const base = Math.floor(total / Math.max(1, etat.length));
    const reste = total - base * etat.length;
    const creneaux = etat.flatMap((g, rang) => {
      const cible = base + (rang < reste ? 1 : 0);
      const plafond = g.capacite === null ? cible : Math.min(cible, g.capacite);
      return Array.from({ length: Math.max(0, plafond - g.effectif) }, () => g);
    });
    tries.forEach((apprenant, rang) => {
      // Au-delà des tranches (capacités atteintes), le groupe le moins rempli qui a de la place.
      placer(apprenant, creneaux[rang] ?? moinsRempli());
    });
    return resultat;
  }

  if (methode === 'critere') {
    const parValeur = new Map<string, ApprenantARepartir[]>();
    for (const a of tries) {
      const cle = a.critere ?? '';
      parValeur.set(cle, [...(parValeur.get(cle) ?? []), a]);
    }
    // Chaque valeur est répartie en tourniquet, en reprenant là où la précédente s'est arrêtée.
    let tour = 0;
    const valeurs = [...parValeur.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, liste] of valeurs) {
      for (const apprenant of liste) {
        const disponibles = etat.filter(place);
        placer(apprenant, disponibles[tour % Math.max(1, disponibles.length)]);
        tour += 1;
      }
    }
    return resultat;
  }

  for (const apprenant of tries) placer(apprenant, moinsRempli());
  return resultat;
}
