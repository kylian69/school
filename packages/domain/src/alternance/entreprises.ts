/**
 * Entreprises et tuteurs (module 03, RG-03-01 à RG-03-04).
 */

/** IDCC sur 4 chiffres (« 16 » devient « 0016 ») ; null si la saisie n'en est pas un. */
export function normaliserIdcc(saisie: string | null | undefined): string | null {
  const propre = (saisie ?? '').replace(/\s+/g, '');
  if (!/^\d{1,4}$/.test(propre)) return null;
  return propre.padStart(4, '0');
}

/** RG-03-02 : OPCO proposé à partir de l'IDCC, d'après la table de correspondance datée. */
export function opcoPropose(
  idcc: string | null,
  correspondance: Readonly<Record<string, string>>,
): string | null {
  return idcc ? (correspondance[idcc] ?? null) : null;
}

export interface FicheAnnuaire {
  siret: string;
  siren: string;
  raisonSociale: string;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  naf: string | null;
  /** Tranche d'effectif salarié (code INSEE). */
  effectif: string | null;
  /** Établissement fermé selon l'annuaire (section 7 : avertissement à la création d'un contrat). */
  ferme: boolean;
  idcc: string[];
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const objet = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * RG-03-01 : lit la réponse de l'annuaire public (API Recherche d'entreprises) pour un SIRET.
 * L'établissement est cherché parmi ceux qui correspondent, puis au siège. Une réponse inattendue
 * ou sans l'établissement donne null : la saisie reste manuelle (section 7).
 */
export function lireFicheAnnuaire(reponse: unknown, siret: string): FicheAnnuaire | null {
  for (const resultat of liste(objet(reponse).results).map(objet)) {
    const etablissements = [
      ...liste(resultat.matching_etablissements).map(objet),
      objet(resultat.siege),
    ];
    const etab = etablissements.find((e) => e.siret === siret);
    if (!etab) continue;
    const siren = texte(resultat.siren) ?? siret.slice(0, 9);
    const idcc = [
      ...liste(etab.liste_idcc),
      ...liste(objet(resultat.complements).liste_idcc),
    ].flatMap((v) => {
      const code = normaliserIdcc(texte(v));
      return code ? [code] : [];
    });
    return {
      siret,
      siren,
      raisonSociale: texte(resultat.nom_raison_sociale) ?? texte(resultat.nom_complet) ?? siren,
      adresse: texte(etab.adresse),
      codePostal: texte(etab.code_postal),
      ville: texte(etab.libelle_commune),
      naf: texte(etab.activite_principale) ?? texte(resultat.activite_principale),
      effectif: texte(etab.tranche_effectif_salarie) ?? texte(resultat.tranche_effectif_salarie),
      ferme: etab.etat_administratif === 'F',
      idcc: [...new Set(idcc)],
    };
  }
  return null;
}

/**
 * RG-03-04 : un maître d'apprentissage encadre au plus N apprentis, plus M dont la formation est
 * prolongée. Au-delà, avertissement sans blocage.
 */
export function depasseCapaciteMaitre(
  apprentis: { prolonge: boolean }[],
  regles: { apprentisParMaitre: number; apprentisSupplementairesProlonges: number },
): boolean {
  const prolonges = apprentis.filter((a) => a.prolonge).length;
  const ordinaires = apprentis.length - prolonges;
  const autorisesProlonges = regles.apprentisSupplementairesProlonges;
  // Les apprentis prolongés au-delà de leur place supplémentaire comptent comme ordinaires.
  const enTrop = Math.max(0, prolonges - autorisesProlonges);
  return ordinaires + enTrop > regles.apprentisParMaitre;
}
