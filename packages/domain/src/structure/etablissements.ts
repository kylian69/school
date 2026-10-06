/**
 * Établissements d'une organisation (US-01-02 ; RG-01-01, RG-01-02).
 */
export type RefusEtablissement = 'dernier-etablissement-actif';

type Verdict = { ok: true } | { ok: false; refus: RefusEtablissement };

/** RG-01-01 : une organisation garde au moins un établissement actif. */
export function verifierArchivageEtablissement(etablissementsActifs: number): Verdict {
  return etablissementsActifs > 1
    ? { ok: true }
    : { ok: false, refus: 'dernier-etablissement-actif' };
}

export type InformationManquante = 'adresse' | 'uai' | 'siret' | 'nda';

export interface IdentiteEtablissement {
  adresseLigne1: string | null;
  codePostal: string | null;
  ville: string | null;
  uai: string | null;
  siret: string | null;
  nda: string | null;
}

/**
 * RG-01-02 : informations absentes que les documents officiels (attestations, conventions,
 * certificats) reprennent ; elles sont signalées sans bloquer la saisie.
 */
export function informationsManquantes(
  etablissement: IdentiteEtablissement,
): InformationManquante[] {
  const manquantes: InformationManquante[] = [];
  if (!etablissement.adresseLigne1 || !etablissement.codePostal || !etablissement.ville) {
    manquantes.push('adresse');
  }
  if (!etablissement.uai) manquantes.push('uai');
  if (!etablissement.siret) manquantes.push('siret');
  if (!etablissement.nda) manquantes.push('nda');
  return manquantes;
}
