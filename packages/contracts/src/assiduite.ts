import { z } from 'zod';

/**
 * Assiduité (I4.4 ; module 06, RG-06-16 à RG-06-18) : retards et absences calculés à partir des
 * appels validés, avec leur décompte en heures et en demi-journées.
 */
export const NatureAbsence = z.enum(['absence', 'retard']);
export type NatureAbsence = z.infer<typeof NatureAbsence>;

/** RG-06-21 : statut de justification ; une absence naît non justifiée. */
export const StatutAbsence = z.enum(['non-justifiee', 'justifiee']);
export type StatutAbsence = z.infer<typeof StatutAbsence>;

/** RG-06-19 : motifs de la liste par défaut de l'école ; aucun détail médical (RG-06-20). */
export const MotifJustificatif = z.enum([
  'maladie',
  'rendez-vous-medical',
  'transport',
  'convocation',
  'evenement-familial',
  'raison-professionnelle',
  'autre',
]);
export type MotifJustificatif = z.infer<typeof MotifJustificatif>;

/** RG-06-21 : à traiter ⇄ complément demandé → accepté ou refusé. */
export const StatutJustificatif = z.enum(['a-traiter', 'complement-demande', 'accepte', 'refuse']);
export type StatutJustificatif = z.infer<typeof StatutJustificatif>;

/** RG-06-19 : photo ou PDF, 10 Mo au plus. */
export const JUSTIFICATIF_TAILLE_MAX = 10 * 1024 * 1024;
export const TYPES_JUSTIFICATIF = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** RG-06-18 : décompte d'un apprenant (heures en minutes, demi-journées distinctes). */
export const DecompteAssiduite = z
  .object({
    absences: z.int().min(0),
    retards: z.int().min(0),
    minutesAbsence: z.int().min(0),
    minutesRetard: z.int().min(0),
    demiJournees: z.int().min(0),
    demiJourneesNonJustifiees: z.int().min(0),
  })
  .meta({ id: 'DecompteAssiduite' });
export type DecompteAssiduite = z.infer<typeof DecompteAssiduite>;

/** Retard ou absence à une séance (E-06-04, E-06-07). */
export const Absence = z
  .object({
    id: z.uuid(),
    seanceId: z.uuid(),
    /** Module ou activité de la séance. */
    libelle: z.string(),
    debut: z.iso.datetime(),
    fin: z.iso.datetime(),
    /** Jour de la séance dans le fuseau de l'établissement (AAAA-MM-JJ). */
    jour: z.iso.date(),
    matin: z.boolean(),
    apresMidi: z.boolean(),
    nature: NatureAbsence,
    /** Durée manquée, en minutes. */
    minutes: z.int().min(1),
    statut: StatutAbsence,
    /** Dernier justificatif déposé pour cette absence, s'il y en a un. */
    justificatif: z.object({ id: z.uuid(), statut: StatutJustificatif }).nullable(),
  })
  .meta({ id: 'Absence' });
export type Absence = z.infer<typeof Absence>;

/** Retard ou absence couvert par un justificatif. */
export const AbsenceJustifiee = Absence.pick({
  id: true,
  libelle: true,
  debut: true,
  fin: true,
  nature: true,
  minutes: true,
}).meta({ id: 'AbsenceJustifiee' });

/** US-06-07 : justificatif vu par l'apprenant (le sien) ou par la scolarité. */
export const Justificatif = z
  .object({
    id: z.uuid(),
    motif: MotifJustificatif,
    /** Précision facultative de l'apprenant (jamais de détail médical). */
    precision: z.string().nullable(),
    statut: StatutJustificatif,
    deposeLe: z.iso.datetime(),
    /** RG-06-19 : déposé après le délai de l'école. */
    horsDelai: z.boolean(),
    /** Un document (photo ou PDF) est joint. */
    document: z.boolean(),
    /** Motif du refus, ou complément demandé. */
    message: z.string().nullable(),
    decideLe: z.iso.datetime().nullable(),
    absences: z.array(AbsenceJustifiee),
  })
  .meta({ id: 'Justificatif' });
export type Justificatif = z.infer<typeof Justificatif>;

/** US-06-07, E-06-05 : dépôt par l'apprenant (le document suit, en PUT). */
export const NouveauJustificatif = z
  .object({
    absenceIds: z.array(z.uuid()).min(1).max(50),
    motif: MotifJustificatif,
    precision: z.string().trim().max(300).optional(),
  })
  .meta({ id: 'NouveauJustificatif' });
export type NouveauJustificatif = z.infer<typeof NouveauJustificatif>;

/** Dépôt par la scolarité pour un apprenant de son périmètre. */
export const DepotJustificatif = NouveauJustificatif.extend({ personneId: z.uuid() }).meta({
  id: 'DepotJustificatif',
});
export type DepotJustificatif = z.infer<typeof DepotJustificatif>;

/** US-06-13, E-06-04 : « Mes absences ». */
export const MesAbsences = z
  .object({
    decompte: DecompteAssiduite,
    /** Alternant (apprenti, professionnalisation) : décompte utile au suivi (RG-03-15). */
    alternant: z.boolean(),
    absences: z.array(Absence),
    /** Ses justificatifs, les plus récents d'abord. */
    justificatifs: z.array(Justificatif),
    /** RG-06-19 : délai de dépôt de l'école, en heures après la séance. */
    delaiHeures: z.int(),
  })
  .meta({ id: 'MesAbsences' });
export type MesAbsences = z.infer<typeof MesAbsences>;

/** E-06-07 : filtres du suivi (période incluse, AAAA-MM-JJ). */
export const FiltreAssiduite = z.object({
  promotionId: z.uuid().optional(),
  du: z.iso.date().optional(),
  au: z.iso.date().optional(),
  statut: StatutAbsence.optional(),
  nature: NatureAbsence.optional(),
});
export type FiltreAssiduite = z.infer<typeof FiltreAssiduite>;

export const ApprenantAssiduite = z
  .object({
    personneId: z.uuid(),
    nom: z.string(),
    prenom: z.string(),
    promotion: z.string().nullable(),
    alternant: z.boolean(),
    decompte: DecompteAssiduite,
  })
  .meta({ id: 'ApprenantAssiduite' });
export type ApprenantAssiduite = z.infer<typeof ApprenantAssiduite>;

export const LigneAssiduite = Absence.extend({
  personneId: z.uuid(),
  nom: z.string(),
  prenom: z.string(),
}).meta({ id: 'LigneAssiduite' });
export type LigneAssiduite = z.infer<typeof LigneAssiduite>;

/** E-06-07 : suivi de la scolarité et de la pédagogie, dans leur périmètre. */
export const SuiviAssiduite = z
  .object({
    promotions: z.array(z.object({ id: z.uuid(), libelle: z.string() })),
    /** Décompte par apprenant ayant au moins un retard ou une absence sur la période. */
    apprenants: z.array(ApprenantAssiduite),
    /** Les plus récentes d'abord, au plus `LIMITE_SUIVI_ASSIDUITE`. */
    absences: z.array(LigneAssiduite),
    tronque: z.boolean(),
  })
  .meta({ id: 'SuiviAssiduite' });
export type SuiviAssiduite = z.infer<typeof SuiviAssiduite>;

export const LIMITE_SUIVI_ASSIDUITE = 500;

/** E-06-06 : justificatif dans la file de traitement. */
export const JustificatifATraiter = Justificatif.extend({
  personneId: z.uuid(),
  nom: z.string(),
  prenom: z.string(),
  promotion: z.string().nullable(),
  /** Déposé par la scolarité pour l'apprenant. */
  deposeParEcole: z.boolean(),
}).meta({ id: 'JustificatifATraiter' });
export type JustificatifATraiter = z.infer<typeof JustificatifATraiter>;

/** E-06-06 : filtres de la file ; sans statut, les justificatifs à traiter. */
export const FiltreJustificatifs = z.object({
  statut: StatutJustificatif.optional(),
  promotionId: z.uuid().optional(),
  motif: MotifJustificatif.optional(),
});
export type FiltreJustificatifs = z.infer<typeof FiltreJustificatifs>;

export const FileJustificatifs = z
  .object({
    promotions: z.array(z.object({ id: z.uuid(), libelle: z.string() })),
    /** Les plus anciens d'abord, au plus `LIMITE_FILE_JUSTIFICATIFS`. */
    justificatifs: z.array(JustificatifATraiter),
    tronque: z.boolean(),
  })
  .meta({ id: 'FileJustificatifs' });
export type FileJustificatifs = z.infer<typeof FileJustificatifs>;

export const LIMITE_FILE_JUSTIFICATIFS = 200;

/** RG-06-21 : décision ; un message est exigé pour un refus ou une demande de complément. */
export const DecisionJustificatif = z
  .object({
    decision: z.enum(['accepter', 'refuser', 'completer']),
    message: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'DecisionJustificatif' });
export type DecisionJustificatif = z.infer<typeof DecisionJustificatif>;
