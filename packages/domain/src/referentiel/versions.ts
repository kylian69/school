/**
 * Versions de maquette (RG-02-04, RG-02-05, RG-02-28). Une version publiée et utilisée par une
 * promotion garde ses coefficients, ECTS et règles : seuls les libellés et les volumes horaires
 * restent corrigeables, avec une trace. Toute autre modification passe par une nouvelle version.
 */
export type StatutVersion = 'brouillon' | 'publiee' | 'archivee';

/** Nature d'une modification demandée sur une version. */
export type NatureModification =
  /** Intitulé, code, critères : corrigeable même sur une version utilisée. */
  | 'libelle'
  /** Volumes horaires : corrigeables même sur une version utilisée. */
  | 'heures'
  /** Coefficient, ECTS, période, option, rattachement à un parent, ajout ou suppression. */
  | 'structure'
  /** Règles de validation, mode d'évaluation, règles particulières. */
  | 'regles';

export type RefusVersion = 'version-archivee' | 'nouvelle-version-requise';

export type VerdictVersion = { ok: true; trace: boolean } | { ok: false; refus: RefusVersion };

export interface EtatVersion {
  statut: StatutVersion;
  /** Liée à au moins une promotion (RG-02-05). */
  utilisee: boolean;
}

/**
 * Une modification est-elle permise sur cette version ? `trace` indique qu'elle touche une
 * version publiée : le journal d'audit le signale comme une correction après publication.
 */
export function verifierModificationVersion(
  version: EtatVersion,
  natures: readonly NatureModification[],
): VerdictVersion {
  if (version.statut === 'archivee') return { ok: false, refus: 'version-archivee' };
  if (version.statut === 'brouillon') return { ok: true, trace: false };
  const verrouillee = version.utilisee;
  if (verrouillee && natures.some((n) => n === 'structure' || n === 'regles')) {
    return { ok: false, refus: 'nouvelle-version-requise' };
  }
  return { ok: true, trace: true };
}

export type RefusPublication = 'deja-publiee' | 'version-archivee' | 'maquette-vide';

/** Seul un brouillon qui compte au moins une UE se publie. */
export function verifierPublication(
  statut: StatutVersion,
  nombreUes: number,
): { ok: true } | { ok: false; refus: RefusPublication } {
  if (statut === 'publiee') return { ok: false, refus: 'deja-publiee' };
  if (statut === 'archivee') return { ok: false, refus: 'version-archivee' };
  if (nombreUes === 0) return { ok: false, refus: 'maquette-vide' };
  return { ok: true };
}

/** Numéro de la prochaine version d'une formation. */
export const prochainNumero = (numeros: readonly number[]) => Math.max(0, ...numeros) + 1;

/**
 * Version que reprend une duplication ou une nouvelle promotion (RG-02-20) : la dernière version
 * publiée, sinon le dernier brouillon. Les versions archivées ne sont jamais reprises.
 */
export function versionDeReference<T extends { numero: number; statut: StatutVersion }>(
  versions: readonly T[],
): T | null {
  const parNumero = [...versions].sort((a, b) => b.numero - a.numero);
  return (
    parNumero.find((v) => v.statut === 'publiee') ??
    parNumero.find((v) => v.statut === 'brouillon') ??
    null
  );
}
