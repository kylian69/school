import { z } from 'zod';
import { PlageEdt } from './structure.js';

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
/** Garde-fou technique : intervenants d'une même séance (co-animation, jury). */
export const INTERVENANTS_MAX = 10;
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
    /** RG-04-01 : un ou plusieurs intervenants (co-animation). */
    intervenantIds: z.array(z.uuid()),
    salleId: z.uuid().nullable(),
    lienVisio: z.string().nullable(),
    distanciel: z.boolean(),
    /** Motif de l'annulation ou du report. */
    motifAnnulation: z.string().nullable(),
    serieId: z.uuid().nullable(),
    /** US-04-11 : séance de remplacement d'une séance reportée. */
    reporteeVersId: z.uuid().nullable(),
    /** RG-04-14 : dernière modification significative d'une séance publiée. */
    modifieeLe: instant.nullable(),
    /** RG-04-14 : badge « modifié », affiché quelques jours après la dernière modification. */
    modifiee: z.boolean(),
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
  /** RG-04-01 : un ou plusieurs intervenants (co-animation). */
  intervenantIds: z.array(z.uuid()).max(INTERVENANTS_MAX).default([]),
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
    intervenantIds: z.array(z.uuid()).max(INTERVENANTS_MAX).optional(),
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

/**
 * US-04-11 : report d'une séance publiée vers un nouveau créneau (et, au besoin, une autre
 * salle) ; une séance de remplacement est créée, la séance d'origine passe « reportée ».
 */
export const ReportSeance = z
  .object({
    motif: texte(500),
    debut: instant,
    fin: instant,
    salleId: z.uuid().nullable().optional(),
    forcages: z.array(ForcageConflit).max(20).default([]),
  })
  .meta({ id: 'ReportSeance' });
export type ReportSeance = z.infer<typeof ReportSeance>;

/** US-04-11 : remplacement d'un intervenant par un autre ; les co-intervenants restent. */
export const RemplacementIntervenant = z
  .object({
    ancienId: z.uuid(),
    nouveauId: z.uuid(),
    portee: z.enum(PORTEES_MODIFICATION).default('seance'),
  })
  .meta({ id: 'RemplacementIntervenant' });
export type RemplacementIntervenant = z.infer<typeof RemplacementIntervenant>;

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
  /**
   * RG-04-02 : plage horaire et jours des créneaux proposés ; absents, ceux de l'établissement.
   */
  plageDebut: heure.optional(),
  plageFin: heure.optional(),
  joursOuverts: z.array(z.int().min(1).max(7)).min(1).max(7).optional(),
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

/** Fond d'un jour de la grille : fermeture (RG-01-04) et jour en entreprise (RG-03-13). */
export const JourEdt = z
  .object({
    jour,
    /** Libellé de la fermeture ou du jour férié ; null si l'établissement est ouvert. */
    fermeture: z.string().nullable(),
    /** Toutes les promotions du public affiché sont en entreprise d'après leur rythme. */
    entreprise: z.boolean(),
  })
  .meta({ id: 'JourEdt' });
export type JourEdt = z.infer<typeof JourEdt>;

/** RG-04-18 : disponibilités récurrentes et indisponibilités de l'intervenant affiché. */
export const DisponibilitesEdt = z
  .object({
    /** Sans créneau, l'intervenant n'a rien déclaré. */
    creneaux: z.array(
      z.object({ jourSemaine: z.int().min(1).max(7), heureDebut: heure, heureFin: heure }),
    ),
    indisponibilites: z.array(z.object({ debut: instant, fin: instant })),
  })
  .meta({ id: 'DisponibilitesEdt' });
export type DisponibilitesEdt = z.infer<typeof DisponibilitesEdt>;

/** RG-04-16 : volume d'un module à placer pour le public affiché, par type (négatif : dépassé). */
export const ModuleAPlacer = z
  .object({
    moduleId: z.uuid(),
    code: z.string(),
    intitule: z.string(),
    type: z.enum(TYPES_SEANCE),
    prevuMinutes: z.number(),
    planifieMinutes: z.number(),
    restantMinutes: z.number(),
  })
  .meta({ id: 'ModuleAPlacer' });
export type ModuleAPlacer = z.infer<typeof ModuleAPlacer>;

export const SemaineEdt = z
  .object({
    debut: jour,
    fin: jour,
    fuseau: z.string(),
    /** RG-04-02 : heures et jours ouvrés de l'établissement, affichés par la grille. */
    plage: PlageEdt,
    seances: z.array(Seance),
    creation: z.boolean(),
    /** Les 7 jours de la semaine, pour le fond de la grille. */
    jours: z.array(JourEdt),
    /** Vue par intervenant, pour qui construit l'emploi du temps ; sinon null. */
    disponibilites: DisponibilitesEdt.nullable(),
    /** Vue par promotion ou par groupe, pour qui construit l'emploi du temps ; sinon null. */
    aPlacer: z.array(ModuleAPlacer).nullable(),
  })
  .meta({ id: 'SemaineEdt' });
export type SemaineEdt = z.infer<typeof SemaineEdt>;

// ——— Import (US-04-04, US-04-05 ; RG-04-08 à RG-04-12) ———

/** RG-04-08 : un fichier iCal s'envoie avec ce type ; CSV et Excel comme les autres imports. */
export const TYPE_FICHIER_ICAL = 'text/calendar';
/** RG-04-12 : version gardée pour une séance modifiée dans Scolaly depuis le dernier import. */
export const VERSIONS_REIMPORT = ['scolaly', 'fichier'] as const;
/** RG-04-09 : libellés rapprochés des objets de Scolaly. */
export const NATURES_CORRESPONDANCE = ['module', 'public', 'salle', 'intervenant'] as const;
export const ACTIONS_IMPORT_SEANCE = [
  'creee',
  'modifiee',
  'inchangee',
  'conservee',
  'ignoree',
] as const;

export const ParametresImportEdt = z.object({
  etablissementId: z.uuid(),
  /** RG-01-18 : vérifier sans rien enregistrer (par défaut). */
  apercu: z.stringbool().default(true),
  /** RG-04-10 : publier directement plutôt qu'importer en brouillon. */
  publier: z.stringbool().default(false),
  /** RG-01-19 : importer seulement les lignes valides plutôt que tout ou rien. */
  lignesValides: z.stringbool().default(false),
  versionConservee: z.enum(VERSIONS_REIMPORT).default('scolaly'),
  /** Public des séances dont le fichier n'indique aucun groupe (agenda d'une promotion). */
  promotionId: z.uuid().optional(),
  groupeId: z.uuid().optional(),
});
export type ParametresImportEdt = z.infer<typeof ParametresImportEdt>;

const MessageImportEdt = z.object({ ligne: z.int().nullable(), message: z.string() });

export const SeanceImportee = z
  .object({
    /** Ligne du tableur (en-tête = 1) ou rang de l'événement iCal. */
    ligne: z.int(),
    identifiant: z.string(),
    seanceId: z.uuid().nullable(),
    libelle: z.string(),
    debut: instant,
    fin: instant,
    action: z.enum(ACTIONS_IMPORT_SEANCE),
    conflits: z.array(ConflitSeance),
  })
  .meta({ id: 'SeanceImportee' });
export type SeanceImportee = z.infer<typeof SeanceImportee>;

export const ResultatImportEdt = z
  .object({
    apercu: z.boolean(),
    /** Vrai si les séances ont été enregistrées. */
    importe: z.boolean(),
    format: z.enum(['csv', 'xlsx', 'ics']),
    compteurs: z.object({
      lues: z.int(),
      creees: z.int(),
      modifiees: z.int(),
      inchangees: z.int(),
      conservees: z.int(),
      ignorees: z.int(),
      rejetees: z.int(),
      disparues: z.int(),
    }),
    /** Erreurs ligne par ligne (null : erreur qui ne tient pas à une ligne). */
    erreurs: z.array(MessageImportEdt),
    avertissements: z.array(MessageImportEdt),
    /** RG-04-09 : libellés à rapprocher avant l'aperçu des séances. */
    inconnus: z.array(
      z.object({
        nature: z.enum(NATURES_CORRESPONDANCE),
        libelle: z.string(),
        lignes: z.array(z.int()),
      }),
    ),
    /** Objets proposés pour les correspondances (vide si aucun libellé inconnu). */
    choix: z.array(
      z.object({ nature: z.enum(NATURES_CORRESPONDANCE), id: z.uuid(), libelle: z.string() }),
    ),
    /** Séances du fichier, hors séances inchangées. */
    seances: z.array(SeanceImportee),
    /** RG-04-11 : séances importées absentes du fichier sur sa période, signalées seulement. */
    disparues: z.array(z.object({ id: z.uuid(), libelle: z.string(), debut: instant })),
  })
  .meta({ id: 'ResultatImportEdt' });
export type ResultatImportEdt = z.infer<typeof ResultatImportEdt>;

/** RG-04-09 : sans objet, activité hors maquette (module), sans salle ou sans intervenant. */
export const CorrespondanceEdt = z
  .object({
    nature: z.enum(NATURES_CORRESPONDANCE),
    libelle: texte(200),
    objetId: z.uuid().nullable(),
  })
  .meta({ id: 'CorrespondanceEdt' });
export type CorrespondanceEdt = z.infer<typeof CorrespondanceEdt>;

export const ListeCorrespondancesEdt = z
  .object({ correspondances: z.array(CorrespondanceEdt) })
  .meta({ id: 'ListeCorrespondancesEdt' });
export type ListeCorrespondancesEdt = z.infer<typeof ListeCorrespondancesEdt>;

export const SaisieCorrespondancesEdt = z
  .object({ correspondances: z.array(CorrespondanceEdt).min(1).max(500) })
  .meta({ id: 'SaisieCorrespondancesEdt' });
export type SaisieCorrespondancesEdt = z.infer<typeof SaisieCorrespondancesEdt>;

/**
 * RG-04-15 : flux iCal personnel. L'adresse secrète n'est renvoyée qu'à son propriétaire (secret
 * conservé chiffré). Un flux créé avant le chiffrement ne peut pas être réaffiché :
 * `regenerationRequise`, il faut le régénérer une fois.
 */
export const FluxIcal = z
  .object({
    actif: z.boolean(),
    regenereLe: instant.nullable(),
    url: z.url().nullable(),
    regenerationRequise: z.boolean(),
  })
  .meta({ id: 'FluxIcal' });
export type FluxIcal = z.infer<typeof FluxIcal>;
