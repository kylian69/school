/**
 * Changements d'une séance publiée (US-04-11) : report vers un nouveau créneau, remplacement d'un
 * intervenant, et repérage des modifications significatives (RG-04-14 : horaire, salle,
 * intervenant, annulation), qui seront signalées aux personnes concernées.
 */
import type { StatutSeance } from './conflits.js';

export type RefusReport =
  'motif-requis' | 'non-publiee' | 'appel-fait' | 'horaire' | 'meme-creneau' | 'passe';

export type VerdictReport = { ok: true } | { ok: false; refus: RefusReport };

/**
 * US-04-11 : seule une séance publiée se reporte (un brouillon se déplace), avec un motif, vers
 * un créneau futur différent. Cas limite : une séance dont l'appel est fait ne se reporte pas.
 */
export function verifierReport(r: {
  motif: string | null | undefined;
  statut: StatutSeance;
  presences: number;
  ancien: { debut: Date; fin: Date };
  nouveau: { debut: Date; fin: Date };
  maintenant: Date;
}): VerdictReport {
  if (!r.motif?.trim()) return { ok: false, refus: 'motif-requis' };
  if (r.statut !== 'publiee') return { ok: false, refus: 'non-publiee' };
  if (r.presences > 0) return { ok: false, refus: 'appel-fait' };
  if (r.nouveau.fin <= r.nouveau.debut) return { ok: false, refus: 'horaire' };
  if (
    r.nouveau.debut.getTime() === r.ancien.debut.getTime() &&
    r.nouveau.fin.getTime() === r.ancien.fin.getTime()
  )
    return { ok: false, refus: 'meme-creneau' };
  if (r.nouveau.debut <= r.maintenant) return { ok: false, refus: 'passe' };
  return { ok: true };
}

export type RefusRemplacement = 'identique' | 'absent' | 'deja-present';

export type VerdictRemplacement =
  { ok: true; intervenantIds: string[] } | { ok: false; refus: RefusRemplacement };

/** RG-04-01 : remplace un intervenant par un autre ; les co-intervenants restent. */
export function remplacerIntervenant(
  intervenantIds: readonly string[],
  ancienId: string,
  nouveauId: string,
): VerdictRemplacement {
  if (ancienId === nouveauId) return { ok: false, refus: 'identique' };
  if (!intervenantIds.includes(ancienId)) return { ok: false, refus: 'absent' };
  if (intervenantIds.includes(nouveauId)) return { ok: false, refus: 'deja-present' };
  return {
    ok: true,
    intervenantIds: intervenantIds.map((id) => (id === ancienId ? nouveauId : id)).sort(),
  };
}

export interface EtatSeance {
  statut: StatutSeance;
  debut: Date;
  fin: Date;
  salleId: string | null;
  intervenantIds: readonly string[];
}

/**
 * RG-04-14 : une modification est significative si la séance était publiée et que son horaire,
 * sa salle, ses intervenants ou son statut (annulation, report) changent. Un brouillon n'a encore
 * été vu de personne.
 */
export function changementSignificatif(avant: EtatSeance, apres: EtatSeance): boolean {
  if (avant.statut !== 'publiee') return false;
  const memes = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  return (
    avant.statut !== apres.statut ||
    avant.debut.getTime() !== apres.debut.getTime() ||
    avant.fin.getTime() !== apres.fin.getTime() ||
    avant.salleId !== apres.salleId ||
    !memes(avant.intervenantIds, apres.intervenantIds)
  );
}
