import { z } from 'zod';

/**
 * Assiduité (I4.4 ; module 06, RG-06-16 à RG-06-18) : retards et absences calculés à partir des
 * appels validés, avec leur décompte en heures et en demi-journées.
 */
export const NatureAbsence = z.enum(['absence', 'retard']);
export type NatureAbsence = z.infer<typeof NatureAbsence>;

/** RG-06-21 : statut de justification ; une absence naît non justifiée. */
export const StatutAbsence = z.enum(['non-justifiee']);
export type StatutAbsence = z.infer<typeof StatutAbsence>;

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
  })
  .meta({ id: 'Absence' });
export type Absence = z.infer<typeof Absence>;

/** US-06-13, E-06-04 : « Mes absences ». */
export const MesAbsences = z
  .object({
    decompte: DecompteAssiduite,
    /** Alternant (apprenti, professionnalisation) : décompte utile au suivi (RG-03-15). */
    alternant: z.boolean(),
    absences: z.array(Absence),
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
