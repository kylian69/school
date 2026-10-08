import { z } from 'zod';

/**
 * Contrats de l'emploi du temps (module 04 : US-04-01 à US-04-03, US-04-06 ; RG-04-01 à
 * RG-04-07, RG-04-13). Les instants sont en UTC (ISO 8601) ; les jours AAAA-MM-JJ et les heures
 * HH:MM sont lus dans le fuseau de l'établissement.
 */
const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');
const instant = z.iso.datetime({ offset: true, message: 'Date et heure attendues (ISO 8601).' });
const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM.');
const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);

export const STATUTS_SEANCE = ['brouillon', 'publiee', 'annulee', 'reportee'] as const;
export const TYPES_SEANCE = ['cm', 'td', 'tp', 'projet', 'examen'] as const;
export const CONFLITS_FORCABLES = ['salle-occupee', 'groupe-occupe'] as const;
/** RG-04-03 : une modification s'applique à cette séance, aux suivantes ou à toute la série. */
export const PORTEES_MODIFICATION = ['seance', 'suivantes', 'serie'] as const;

/** RG-04-05 : conflits bloquants et avertissements d'une séance. */
export const ConflitSeance = z
  .discriminatedUnion('code', [
    z.object({
      code: z.literal('salle-occupee'),
      niveau: z.literal('bloquant'),
      seanceId: z.uuid(),
    }),
    z.object({
      code: z.literal('intervenant-occupe'),
      niveau: z.literal('bloquant'),
      seanceId: z.uuid(),
      intervenantIds: z.array(z.uuid()),
    }),
    z.object({
      code: z.literal('groupe-occupe'),
      niveau: z.literal('bloquant'),
      seanceId: z.uuid(),
      groupeIds: z.array(z.uuid()),
      apprenantIds: z.array(z.uuid()),
    }),
    z.object({
      code: z.literal('jour-ferme'),
      niveau: z.literal('bloquant'),
      jours: z.array(jour),
    }),
    z.object({
      code: z.literal('jour-entreprise'),
      niveau: z.literal('avertissement'),
      apprenants: z.array(
        z.object({ apprenantId: z.uuid(), raison: z.enum(['entreprise', 'stage']) }),
      ),
      effectif: z.int(),
    }),
    z.object({
      code: z.literal('capacite-salle'),
      niveau: z.literal('avertissement'),
      capacite: z.int(),
      effectif: z.int(),
    }),
    z.object({
      code: z.literal('intervenant-indisponible'),
      niveau: z.literal('avertissement'),
      intervenantId: z.uuid(),
      raison: z.enum(['indisponibilite', 'hors-disponibilites']),
    }),
    z.object({
      code: z.literal('volume-module'),
      niveau: z.literal('avertissement'),
      groupeId: z.uuid(),
      prevuMinutes: z.number(),
      planifieMinutes: z.number(),
    }),
  ])
  .meta({ id: 'ConflitSeance' });
export type ConflitSeance = z.infer<typeof ConflitSeance>;

/** RG-04-06 : forçage d'un conflit de salle ou de groupe avec une autre séance, motivé. */
export const ForcageConflit = z
  .object({
    code: z.enum(CONFLITS_FORCABLES),
    seanceId: z.uuid(),
    motif: texte(500),
  })
  .meta({ id: 'ForcageConflit' });
export type ForcageConflit = z.infer<typeof ForcageConflit>;

export const Seance = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    debut: instant,
    fin: instant,
    statut: z.enum(STATUTS_SEANCE),
    type: z.enum(TYPES_SEANCE).nullable(),
    moduleId: z.uuid().nullable(),
    activite: z.string().nullable(),
    promotionIds: z.array(z.uuid()),
    groupeIds: z.array(z.uuid()),
    intervenantId: z.uuid().nullable(),
    salleId: z.uuid().nullable(),
    lienVisio: z.string().nullable(),
    distanciel: z.boolean(),
    motifAnnulation: z.string().nullable(),
    serieId: z.uuid().nullable(),
    conflits: z.array(ConflitSeance),
    forcages: z.array(ForcageConflit),
    modifiable: z.boolean(),
  })
  .meta({ id: 'Seance' });
export type Seance = z.infer<typeof Seance>;

/** RG-04-01 : contenu d'une séance (module ou activité hors maquette, public, ressources). */
const ContenuSeance = z.object({
  type: z.enum(TYPES_SEANCE),
  moduleId: z.uuid().nullable().default(null),
  /** Activité hors maquette (réunion, accueil, rattrapage) quand il n'y a pas de module. */
  activite: texte(120).nullable().default(null),
  promotionIds: z.array(z.uuid()).max(20).default([]),
  groupeIds: z.array(z.uuid()).max(20).default([]),
  intervenantId: z.uuid().nullable().default(null),
  salleId: z.uuid().nullable().default(null),
  lienVisio: z.url('Lien de visio attendu (https://…).').max(500).nullable().default(null),
  distanciel: z.boolean().default(false),
});

const avecPublic = (v: { promotionIds: string[]; groupeIds: string[] }) =>
  v.promotionIds.length + v.groupeIds.length > 0;
const MESSAGE_PUBLIC = 'Choisissez au moins une promotion ou un groupe.';
const MESSAGE_MODULE = 'Choisissez un module, ou décrivez une activité hors maquette.';
const moduleOuActivite = (v: { moduleId: string | null; activite: string | null }) =>
  (v.moduleId === null) !== (v.activite === null);

export const SaisieSeance = ContenuSeance.extend({
  debut: instant,
  fin: instant,
  forcages: z.array(ForcageConflit).max(20).default([]),
})
  .refine(avecPublic, { message: MESSAGE_PUBLIC, path: ['groupeIds'] })
  .refine(moduleOuActivite, { message: MESSAGE_MODULE, path: ['moduleId'] })
  .meta({ id: 'SaisieSeance' });
export type SaisieSeance = z.infer<typeof SaisieSeance>;

/** Modification ; debut et fin ne se changent que pour la seule séance (portée « seance »). */
export const ModificationSeance = z
  .object({
    portee: z.enum(PORTEES_MODIFICATION).default('seance'),
    debut: instant.optional(),
    fin: instant.optional(),
    type: z.enum(TYPES_SEANCE).optional(),
    moduleId: z.uuid().nullable().optional(),
    activite: texte(120).nullable().optional(),
    promotionIds: z.array(z.uuid()).max(20).optional(),
    groupeIds: z.array(z.uuid()).max(20).optional(),
    intervenantId: z.uuid().nullable().optional(),
    salleId: z.uuid().nullable().optional(),
    lienVisio: z.url('Lien de visio attendu (https://…).').max(500).nullable().optional(),
    distanciel: z.boolean().optional(),
    forcages: z.array(ForcageConflit).max(20).default([]),
  })
  .meta({ id: 'ModificationSeance' });
export type ModificationSeance = z.infer<typeof ModificationSeance>;

/** RG-04-04 : annulation motivée ; les données de la séance sont conservées. */
export const AnnulationSeance = z
  .object({ motif: texte(500), portee: z.enum(PORTEES_MODIFICATION).default('seance') })
  .meta({ id: 'AnnulationSeance' });
export type AnnulationSeance = z.infer<typeof AnnulationSeance>;

export const ResultatSeances = z
  .object({ seances: z.array(Seance) })
  .meta({ id: 'ResultatSeances' });
export type ResultatSeances = z.infer<typeof ResultatSeances>;

/** RG-04-13 : publication par séance, par semaine ou par période (les séances listées). */
export const PublicationSeances = z
  .object({ seanceIds: z.array(z.uuid()).min(1).max(2000) })
  .meta({ id: 'PublicationSeances' });
export type PublicationSeances = z.infer<typeof PublicationSeances>;

/** US-04-02, RG-04-03 : série hebdomadaire ou toutes les N semaines, entre deux dates. */
export const SaisieSerie = ContenuSeance.extend({
  dateDebut: jour,
  dateFin: jour,
  joursSemaine: z.array(z.int().min(1).max(7)).min(1).max(7),
  intervalleSemaines: z.int().min(1).default(1),
  heureDebut: heure,
  heureFin: heure,
  sauterJoursEntreprise: z.boolean().default(false),
  joursExclus: z.array(jour).max(366).default([]),
})
  .refine(avecPublic, { message: MESSAGE_PUBLIC, path: ['groupeIds'] })
  .refine(moduleOuActivite, { message: MESSAGE_MODULE, path: ['moduleId'] })
  .meta({ id: 'SaisieSerie' });
export type SaisieSerie = z.infer<typeof SaisieSerie>;

export const ApercuSerie = z
  .object({
    occurrences: z.array(z.object({ jour, debut: instant, fin: instant })),
    sautees: z.array(z.object({ jour, raison: z.enum(['fermeture', 'entreprise', 'exclu']) })),
  })
  .meta({ id: 'ApercuSerie' });
export type ApercuSerie = z.infer<typeof ApercuSerie>;

export const SerieCreee = z
  .object({ serieId: z.uuid(), seances: z.array(Seance), sautees: ApercuSerie.shape.sautees })
  .meta({ id: 'SerieCreee' });
export type SerieCreee = z.infer<typeof SerieCreee>;

/** RG-04-05, RG-04-07 : contrôle d'une séance envisagée, avec des solutions. */
export const VerificationSeance = ContenuSeance.extend({
  /** Séance déplacée : elle est ignorée dans les conflits. */
  id: z.uuid().optional(),
  debut: instant,
  fin: instant,
  /** RG-04-02 : plage horaire de l'établissement pour les créneaux proposés. */
  plageDebut: heure.default('08:00'),
  plageFin: heure.default('19:00'),
  joursOuverts: z.array(z.int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
  typeSalle: z
    .enum(['cours', 'tp_informatique', 'laboratoire', 'amphitheatre', 'virtuelle'])
    .optional(),
  equipements: z.array(z.string().max(80)).max(20).default([]),
})
  .refine(avecPublic, { message: MESSAGE_PUBLIC, path: ['groupeIds'] })
  .meta({ id: 'VerificationSeance' });
export type VerificationSeance = z.infer<typeof VerificationSeance>;

export const ResultatVerification = z
  .object({
    conflits: z.array(ConflitSeance),
    /** Si la salle est prise : salles libres compatibles, la plus petite d'abord. */
    sallesLibres: z.array(
      z.object({ id: z.uuid(), nom: z.string(), capacite: z.int(), type: z.string() }),
    ),
    /** Si l'intervenant ou le groupe est pris : créneaux libres les plus proches. */
    creneauxLibres: z.array(z.object({ debut: instant, fin: instant })),
  })
  .meta({ id: 'ResultatVerification' });
export type ResultatVerification = z.infer<typeof ResultatVerification>;

/** Lecture d'une semaine de l'établissement, filtrable par promotion, groupe, salle, intervenant. */
export const RechercheSemaine = z.object({
  etablissementId: z.uuid(),
  /** Premier jour de la semaine affichée (7 jours). */
  debut: jour,
  promotionId: z.uuid().optional(),
  groupeId: z.uuid().optional(),
  salleId: z.uuid().optional(),
  intervenantId: z.uuid().optional(),
});
export type RechercheSemaine = z.infer<typeof RechercheSemaine>;

export const SemaineEdt = z
  .object({
    debut: jour,
    fin: jour,
    fuseau: z.string(),
    seances: z.array(Seance),
    creation: z.boolean(),
  })
  .meta({ id: 'SemaineEdt' });
export type SemaineEdt = z.infer<typeof SemaineEdt>;
