import type { StatutAbsence } from './absences.js';

/**
 * Justificatifs d'absence (I4.4 ; RG-06-19 à RG-06-21) : l'apprenant, ou la scolarité pour lui,
 * dépose un justificatif pour une ou plusieurs absences ou retards ; la scolarité et la pédagogie
 * l'acceptent, le refusent avec un motif ou demandent un complément. L'acceptation passe les
 * absences en « justifiée » sans toucher à la feuille signée.
 */

/** RG-06-19 : liste de motifs par défaut de l'école (aucun détail médical, RG-06-20). */
export const MOTIFS_JUSTIFICATIF = [
  'maladie',
  'rendez-vous-medical',
  'transport',
  'convocation',
  'evenement-familial',
  'raison-professionnelle',
  'autre',
] as const;
export type MotifJustificatif = (typeof MOTIFS_JUSTIFICATIF)[number];

/** Cycle d'un justificatif : à traiter ⇄ complément demandé → accepté ou refusé. */
export const STATUTS_JUSTIFICATIF = [
  'a-traiter',
  'complement-demande',
  'accepte',
  'refuse',
] as const;
export type StatutJustificatif = (typeof STATUTS_JUSTIFICATIF)[number];

/** Justificatifs encore à décider : ils bloquent un nouveau dépôt pour les mêmes absences. */
export const STATUTS_JUSTIFICATIF_OUVERTS: readonly StatutJustificatif[] = [
  'a-traiter',
  'complement-demande',
];

/**
 * RG-06-19 : délai de dépôt par défaut, en heures après la fin de la séance (paramétrable par
 * l'école). Un dépôt hors délai reste possible ; il est signalé.
 */
export const JUSTIFICATIF_DELAI_HEURES = 48;

const HEURE = 3_600_000;

/**
 * Dépôt hors délai : la plus ancienne séance concernée s'est terminée plus de `delaiHeures` heures
 * avant le dépôt.
 */
export function depotHorsDelai(
  finsSeances: readonly Date[],
  depot: Date,
  delaiHeures: number,
): boolean {
  if (finsSeances.length === 0) return false;
  const plusAncienne = Math.min(...finsSeances.map((f) => f.getTime()));
  return depot.getTime() > plusAncienne + delaiHeures * HEURE;
}

/**
 * Une absence peut recevoir un nouveau justificatif si aucun justificatif n'est en cours ni
 * accepté pour elle (après un refus, l'apprenant peut en déposer un autre).
 */
export const absenceJustifiable = (
  statutAbsence: StatutAbsence,
  lies: readonly StatutJustificatif[],
) => statutAbsence === 'non-justifiee' && lies.every((s) => s === 'refuse');

/** Le document peut être ajouté ou remplacé tant que le justificatif n'est pas décidé. */
export const documentModifiable = (statut: StatutJustificatif) =>
  STATUTS_JUSTIFICATIF_OUVERTS.includes(statut);

export type DecisionJustificatif = 'accepter' | 'refuser' | 'completer';
export const DECISIONS_JUSTIFICATIF = [
  'accepter',
  'refuser',
  'completer',
] as const satisfies readonly DecisionJustificatif[];

export type RefusDecision = 'deja-decide' | 'message-requis';

const STATUT_APRES: Record<DecisionJustificatif, StatutJustificatif> = {
  accepter: 'accepte',
  refuser: 'refuse',
  completer: 'complement-demande',
};

/**
 * RG-06-21 : décision de la scolarité ou de la pédagogie. Un refus ou une demande de complément
 * exige un message pour l'apprenant ; un justificatif accepté ou refusé ne se redécide pas.
 */
export function deciderJustificatif(
  statut: StatutJustificatif,
  decision: DecisionJustificatif,
  message: string | null,
): { ok: true; statut: StatutJustificatif } | { ok: false; refus: RefusDecision } {
  if (!STATUTS_JUSTIFICATIF_OUVERTS.includes(statut)) return { ok: false, refus: 'deja-decide' };
  if (decision !== 'accepter' && !message?.trim()) return { ok: false, refus: 'message-requis' };
  return { ok: true, statut: STATUT_APRES[decision] };
}

/** Statut des absences liées après la décision : seule l'acceptation les justifie. */
export const statutAbsenceApres = (statut: StatutJustificatif): StatutAbsence =>
  statut === 'accepte' ? 'justifiee' : 'non-justifiee';
