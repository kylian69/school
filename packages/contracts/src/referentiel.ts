import { z } from 'zod';

/**
 * Contrats du référentiel pédagogique (module 02) : catalogue des formations (E-02-01), éditeur de
 * maquette (E-02-02), règles de validation et simulateur (E-02-03), référentiel de compétences
 * (E-02-09) et règles de l'école (E-02-10).
 */

const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);
const note = z.number().min(0, 'Une note va de 0 à 20.').max(20, 'Une note va de 0 à 20.');
const positif = (max: number) =>
  z
    .number()
    .min(0, 'La valeur ne peut pas être négative.')
    .max(max, `${String(max)} au plus.`);

export const TYPES_FORMATION = ['bts', 'bachelor', 'master', 'titre_rncp', 'cqp', 'autre'] as const;
export const MODES_FORMATION = [
  'initial',
  'apprentissage',
  'professionnalisation',
  'formation_continue',
] as const;
export const STATUTS_VERSION = ['brouillon', 'publiee', 'archivee'] as const;
export const TYPES_HEURES = ['cm', 'td', 'tp', 'projet', 'elearning'] as const;

/** RG-02-01 : code RNCP ou RS facultatif, normalisé en majuscules sans espace. */
const codeRncp = z
  .string()
  .trim()
  .overwrite((v) => v.replace(/\s+/g, '').toUpperCase())
  .regex(/^((RNCP|RS)\d{1,6})?$/, 'Code attendu au format RNCP12345 ou RS1234.')
  .nullable();

// ——— Formations ———

export const VersionResume = z
  .object({
    id: z.uuid(),
    numero: z.int(),
    statut: z.enum(STATUTS_VERSION),
    publieeLe: z.iso.datetime({ offset: true }).nullable(),
    /** Liée à au moins une promotion (RG-02-05). */
    utilisee: z.boolean(),
  })
  .meta({ id: 'VersionResume' });
export type VersionResume = z.infer<typeof VersionResume>;

export const Formation = z
  .object({
    id: z.uuid(),
    intitule: z.string(),
    type: z.enum(TYPES_FORMATION),
    niveau: z.int(),
    codeRncp: z.string().nullable(),
    dureeAnnees: z.int(),
    modes: z.array(z.enum(MODES_FORMATION)),
    statut: z.enum(['active', 'archivee']),
    etablissementIds: z.array(z.uuid()),
    versions: z.array(VersionResume),
    /** Droits de la personne sur cette formation (périmètre, RG-00-10). */
    modifiable: z.boolean(),
    publiable: z.boolean(),
  })
  .meta({ id: 'Formation' });
export type Formation = z.infer<typeof Formation>;

export const ListeFormations = z
  .object({
    formations: z.array(Formation),
    /** La personne peut créer une formation (périmètre organisation ou établissement). */
    creation: z.boolean(),
  })
  .meta({ id: 'ListeFormations' });
export type ListeFormations = z.infer<typeof ListeFormations>;

export const RechercheFormations = z.object({
  type: z.enum(TYPES_FORMATION).optional(),
  niveau: z.coerce.number().int().min(5).max(8).optional(),
  mode: z.enum(MODES_FORMATION).optional(),
  etablissementId: z.uuid().optional(),
  statut: z.enum(['active', 'archivee']).optional(),
});
export type RechercheFormations = z.infer<typeof RechercheFormations>;

export const NouvelleFormation = z
  .object({
    intitule: texte(200),
    type: z.enum(TYPES_FORMATION),
    niveau: z.int().min(5, 'Niveau de 5 à 8.').max(8, 'Niveau de 5 à 8.'),
    codeRncp: codeRncp.optional(),
    dureeAnnees: z.int().min(1, 'Durée de 1 à 8 ans.').max(8, 'Durée de 1 à 8 ans.'),
    modes: z
      .array(z.enum(MODES_FORMATION))
      .min(1, 'Choisissez au moins un mode.')
      .overwrite((m) => [...new Set(m)]),
    etablissementIds: z.array(z.uuid()).max(50).default([]),
  })
  .meta({ id: 'NouvelleFormation' });
export type NouvelleFormation = z.infer<typeof NouvelleFormation>;

export const ModificationFormation = NouvelleFormation.partial()
  .extend({ statut: z.enum(['active', 'archivee']).optional() })
  .meta({ id: 'ModificationFormation' });
export type ModificationFormation = z.infer<typeof ModificationFormation>;

/** US-02-04 : copie d'une formation et de sa dernière version de maquette. */
export const DuplicationFormation = z
  .object({ intitule: texte(200) })
  .meta({ id: 'DuplicationFormation' });
export type DuplicationFormation = z.infer<typeof DuplicationFormation>;

// ——— Règles de validation (RG-02-07, RG-02-08, RG-02-24, RG-02-25) ———

export const MODES_VALIDATION = ['lmd', 'blocs', 'sans_compensation'] as const;
export const MODES_EVALUATION = ['notes', 'competences', 'les_deux'] as const;

export const ReglesValidation = z
  .object({
    mode: z.enum(MODES_VALIDATION),
    seuil: note,
    noteEliminatoire: note.nullable(),
    compensationModules: z.boolean(),
    compensationSemestres: z.boolean(),
    arrondi: z.object({
      decimales: z.int().min(0).max(3),
      methode: z.enum(['plus_proche', 'inferieur', 'superieur']),
    }),
    mentions: z.array(z.object({ libelle: texte(40), seuil: note })).max(6),
    modeEvaluation: z.enum(MODES_EVALUATION),
    validationBlocs: z.enum(MODES_EVALUATION),
    regleNiveau: z.enum(['derniere', 'meilleur', 'frequent']),
  })
  .meta({ id: 'ReglesValidation' });
export type ReglesValidation = z.infer<typeof ReglesValidation>;

const CibleRegle = z.discriminatedUnion('niveau', [
  z.object({ niveau: z.literal('generale') }),
  z.object({ niveau: z.literal('ue'), id: z.uuid() }),
  z.object({ niveau: z.literal('module'), id: z.uuid() }),
]);

const typeEvaluation = texte(40);

/** RG-02-26 : paramètres de chaque type de règle particulière. */
export const RegleParticuliere = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('bonus'),
      valeur: z.number().min(-20).max(100),
      unite: z.enum(['points', 'pourcentage']),
      cible: CibleRegle,
      plafond: note.nullable(),
      automatique: z.boolean(),
    }),
    z.object({
      type: z.literal('ue_bonus'),
      /** Choisie à l'activation dans une version ; null dans la bibliothèque de l'école. */
      source: z.object({ niveau: z.enum(['ue', 'module']), id: z.uuid() }).nullable(),
      seuil: note,
      diviseur: z.number().positive('Le diviseur doit être positif.').max(100),
      cible: CibleRegle,
    }),
    z.object({
      type: z.literal('points_jury'),
      maximum: z.number().positive().max(5),
      seuils: z.array(note).max(5),
    }),
    z.object({
      type: z.literal('plafond'),
      typeEvaluation,
      sens: z.enum(['plafond', 'plancher']),
      valeur: note,
    }),
    z.object({
      type: z.literal('ponderation'),
      poids: z
        .array(z.object({ typeEvaluation, poids: positif(100) }))
        .min(1)
        .max(10),
    }),
    z.object({
      type: z.literal('penalite_absence'),
      typeAbsence: z.enum(['injustifiee', 'justifiee']),
      note,
    }),
  ])
  .meta({ id: 'RegleParticuliere' });
export type RegleParticuliere = z.infer<typeof RegleParticuliere>;
export const TYPES_REGLE_PARTICULIERE = [
  'ponderation',
  'plafond',
  'penalite_absence',
  'ue_bonus',
  'bonus',
  'points_jury',
] as const;

/** Règle de la bibliothèque de l'école (E-02-10). */
export const RegleBibliotheque = z
  .object({ id: z.uuid(), libelle: z.string(), regle: RegleParticuliere })
  .meta({ id: 'RegleBibliotheque' });
export type RegleBibliotheque = z.infer<typeof RegleBibliotheque>;

export const ListeReglesBibliotheque = z
  .object({ regles: z.array(RegleBibliotheque) })
  .meta({ id: 'ListeReglesBibliotheque' });
export type ListeReglesBibliotheque = z.infer<typeof ListeReglesBibliotheque>;

export const SaisieRegleBibliotheque = z
  .object({ libelle: texte(120), regle: RegleParticuliere })
  .meta({ id: 'SaisieRegleBibliotheque' });
export type SaisieRegleBibliotheque = z.infer<typeof SaisieRegleBibliotheque>;

/** Règle activée dans une version, paramètres figés (RG-02-28). */
export const RegleActivee = z
  .object({
    id: z.uuid(),
    /** Règle de la bibliothèque d'origine ; null si elle a été supprimée depuis. */
    regleId: z.uuid().nullable(),
    libelle: z.string(),
    regle: RegleParticuliere,
  })
  .meta({ id: 'RegleActivee' });
export type RegleActivee = z.infer<typeof RegleActivee>;

/** Les règles envoyées remplacent celles de la version (E-02-03). */
export const SaisieReglesVersion = z
  .object({
    regles: ReglesValidation,
    reglesParticulieres: z
      .array(
        z.object({
          regleId: z.uuid().nullable(),
          libelle: texte(120),
          regle: RegleParticuliere,
        }),
      )
      .max(30),
  })
  .meta({ id: 'SaisieReglesVersion' });
export type SaisieReglesVersion = z.infer<typeof SaisieReglesVersion>;

// ——— Échelle de maîtrise (RG-02-22) ———

const couleur = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur attendue au format #RRVVBB.')
  .overwrite((c) => c.toUpperCase());

export const NiveauMaitrise = z
  .object({
    /** Identifiant ; « defaut-N » tant que l'école n'a pas enregistré son échelle. */
    id: z.string(),
    libelle: z.string(),
    couleur: z.string(),
    valeur: z.number().nullable(),
    ordre: z.int(),
    valide: z.boolean(),
  })
  .meta({ id: 'NiveauMaitrise' });
export type NiveauMaitrise = z.infer<typeof NiveauMaitrise>;

export const EchelleMaitrise = z
  .object({ niveaux: z.array(NiveauMaitrise), parDefaut: z.boolean() })
  .meta({ id: 'EchelleMaitrise' });
export type EchelleMaitrise = z.infer<typeof EchelleMaitrise>;

/** L'échelle envoyée remplace la précédente, dans l'ordre de la liste. */
export const SaisieEchelle = z
  .object({
    niveaux: z
      .array(
        z.object({
          libelle: texte(60),
          couleur,
          valeur: z.number().min(0).max(100).nullable(),
          valide: z.boolean(),
        }),
      )
      .min(2, 'Une échelle compte au moins deux niveaux.')
      .max(8)
      .refine((n) => n.some((x) => x.valide), 'Au moins un niveau doit valider la compétence.'),
  })
  .meta({ id: 'SaisieEchelle' });
export type SaisieEchelle = z.infer<typeof SaisieEchelle>;

// ——— Maquette (RG-02-02 à RG-02-06) ———

const Heures = z.object({
  cm: z.number(),
  td: z.number(),
  tp: z.number(),
  projet: z.number(),
  elearning: z.number(),
});

export const BlocMaquette = z
  .object({ id: z.uuid(), code: z.string(), intitule: z.string(), ordre: z.int() })
  .meta({ id: 'BlocMaquette' });
export type BlocMaquette = z.infer<typeof BlocMaquette>;

export const UeMaquette = z
  .object({
    id: z.uuid(),
    blocId: z.uuid().nullable(),
    code: z.string(),
    intitule: z.string(),
    annee: z.int(),
    semestre: z.int().nullable(),
    ects: z.number(),
    coefficient: z.number(),
    option: z.string().nullable(),
    ordre: z.int(),
  })
  .meta({ id: 'UeMaquette' });
export type UeMaquette = z.infer<typeof UeMaquette>;

export const ModuleMaquette = z
  .object({
    id: z.uuid(),
    ueId: z.uuid(),
    code: z.string(),
    intitule: z.string(),
    coefficient: z.number(),
    heures: Heures,
    ordre: z.int(),
  })
  .meta({ id: 'ModuleMaquette' });
export type ModuleMaquette = z.infer<typeof ModuleMaquette>;

export const Competence = z
  .object({
    id: z.uuid(),
    blocId: z.uuid(),
    code: z.string(),
    intitule: z.string(),
    criteres: z.array(z.string()),
    moduleIds: z.array(z.uuid()),
    ordre: z.int(),
  })
  .meta({ id: 'Competence' });
export type Competence = z.infer<typeof Competence>;

export const AvertissementMaquette = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('semestre-ects'),
      annee: z.int(),
      semestre: z.int(),
      ects: z.number(),
      attendu: z.number(),
    }),
    z.object({ type: z.literal('ue-sans-module'), ueId: z.string(), code: z.string() }),
    z.object({
      type: z.literal('code-en-double'),
      niveau: z.enum(['bloc', 'ue', 'module']),
      code: z.string(),
    }),
  ])
  .meta({ id: 'AvertissementMaquette' });
export type AvertissementMaquette = z.infer<typeof AvertissementMaquette>;

export const TotauxMaquette = z
  .object({
    heures: Heures,
    heuresTotal: z.number(),
    ects: z.number(),
    periodes: z.array(
      z.object({
        annee: z.int(),
        semestre: z.int().nullable(),
        ects: z.number(),
        heures: Heures,
      }),
    ),
    annees: z.array(z.object({ annee: z.int(), ects: z.number() })),
    ues: z.record(
      z.string(),
      z.object({ heures: Heures, heuresTotal: z.number(), modules: z.int() }),
    ),
    blocs: z.record(z.string(), z.object({ ects: z.number(), heuresTotal: z.number() })),
  })
  .meta({ id: 'TotauxMaquette' });
export type TotauxMaquette = z.infer<typeof TotauxMaquette>;

export const Maquette = z
  .object({
    formation: z.object({ id: z.uuid(), intitule: z.string(), dureeAnnees: z.int() }),
    version: VersionResume,
    versions: z.array(VersionResume),
    modifiable: z.boolean(),
    publiable: z.boolean(),
    regles: ReglesValidation,
    reglesParticulieres: z.array(RegleActivee),
    reglement: z.object({ disponible: z.boolean() }),
    blocs: z.array(BlocMaquette),
    ues: z.array(UeMaquette),
    modules: z.array(ModuleMaquette),
    competences: z.array(Competence),
    totaux: TotauxMaquette,
    avertissements: z.array(AvertissementMaquette),
  })
  .meta({ id: 'Maquette' });
export type Maquette = z.infer<typeof Maquette>;

const code = texte(30);
const ordre = z.int().min(0).max(999);

export const SaisieBloc = z.object({ code, intitule: texte(200) }).meta({ id: 'SaisieBloc' });
export type SaisieBloc = z.infer<typeof SaisieBloc>;
export const ModificationBloc = SaisieBloc.partial()
  .extend({ ordre: ordre.optional() })
  .meta({ id: 'ModificationBloc' });
export type ModificationBloc = z.infer<typeof ModificationBloc>;

export const SaisieUe = z
  .object({
    blocId: z.uuid().nullable().default(null),
    code,
    intitule: texte(200),
    annee: z.int().min(1).max(8).default(1),
    semestre: z
      .union([z.literal(1), z.literal(2)])
      .nullable()
      .default(1),
    ects: positif(120).default(0),
    coefficient: positif(100).default(1),
    option: z.string().trim().max(60).nullable().default(null),
  })
  .meta({ id: 'SaisieUe' });
export type SaisieUe = z.infer<typeof SaisieUe>;
export const ModificationUe = z
  .object({
    blocId: z.uuid().nullable(),
    code,
    intitule: texte(200),
    annee: z.int().min(1).max(8),
    semestre: z.union([z.literal(1), z.literal(2)]).nullable(),
    ects: positif(120),
    coefficient: positif(100),
    option: z.string().trim().max(60).nullable(),
    ordre,
  })
  .partial()
  .meta({ id: 'ModificationUe' });
export type ModificationUe = z.infer<typeof ModificationUe>;

const SaisieHeures = z.object({
  cm: positif(2000).default(0),
  td: positif(2000).default(0),
  tp: positif(2000).default(0),
  projet: positif(2000).default(0),
  elearning: positif(2000).default(0),
});

export const SaisieModule = z
  .object({
    ueId: z.uuid(),
    code,
    intitule: texte(200),
    coefficient: positif(100).default(1),
    heures: SaisieHeures.prefault({}),
  })
  .meta({ id: 'SaisieModule' });
export type SaisieModule = z.infer<typeof SaisieModule>;
export const ModificationModule = z
  .object({
    ueId: z.uuid(),
    code,
    intitule: texte(200),
    coefficient: positif(100),
    heures: SaisieHeures,
    ordre,
  })
  .partial()
  .meta({ id: 'ModificationModule' });
export type ModificationModule = z.infer<typeof ModificationModule>;

export const SaisieCompetence = z
  .object({
    blocId: z.uuid(),
    code,
    intitule: texte(300),
    criteres: z.array(texte(300)).max(20).default([]),
    moduleIds: z.array(z.uuid()).max(100).default([]),
  })
  .meta({ id: 'SaisieCompetence' });
export type SaisieCompetence = z.infer<typeof SaisieCompetence>;
export const ModificationCompetence = z
  .object({
    blocId: z.uuid(),
    code,
    intitule: texte(300),
    criteres: z.array(texte(300)).max(20),
    moduleIds: z.array(z.uuid()).max(100),
    ordre,
  })
  .partial()
  .meta({ id: 'ModificationCompetence' });
export type ModificationCompetence = z.infer<typeof ModificationCompetence>;

/** Élément créé dans la maquette : son identifiant, et la maquette à jour. */
export const ElementCree = z
  .object({ id: z.uuid(), maquette: Maquette })
  .meta({ id: 'ElementCree' });
export type ElementCree = z.infer<typeof ElementCree>;

// ——— Simulateur (RG-02-10) ———

export const SaisieSimulation = z
  .object({
    annee: z.int().min(1).max(8).default(1),
    option: z.string().trim().max(60).nullable().default(null),
    evaluations: z
      .array(
        z.object({
          moduleId: z.uuid(),
          type: typeEvaluation.default('examen'),
          coefficient: positif(100).default(1),
          note: z.number().min(0).nullable(),
          sur: z.number().positive().max(1000).default(20),
          absence: z.enum(['injustifiee', 'justifiee']).nullable().default(null),
        }),
      )
      .max(2000),
    bonusAccordes: z.array(z.uuid()).max(30).default([]),
    pointsJury: z
      .array(
        z.object({
          regleId: z.uuid(),
          cible: CibleRegle,
          points: z.number().min(0).max(5),
          motif: z.string().max(300),
        }),
      )
      .max(30)
      .default([]),
    niveauxCompetences: z.record(z.uuid(), z.string().nullable()).default({}),
  })
  .meta({ id: 'SaisieSimulation' });
export type SaisieSimulation = z.infer<typeof SaisieSimulation>;

const decision = z.enum(['moyenne', 'compensation']).nullable();

export const ResultatSimulation = z
  .object({
    modules: z.array(
      z.object({
        id: z.string(),
        moyenne: z.number().nullable(),
        eliminatoire: z.boolean(),
        bonus: z.boolean(),
      }),
    ),
    ues: z.array(
      z.object({
        id: z.string(),
        moyenne: z.number().nullable(),
        acquise: z.boolean().nullable(),
        par: decision,
        ects: z.number(),
        eliminatoire: z.boolean(),
        bonus: z.boolean(),
      }),
    ),
    periodes: z.array(
      z.object({
        cle: z.string(),
        semestre: z.int().nullable(),
        moyenne: z.number().nullable(),
        validee: z.boolean().nullable(),
        par: decision,
      }),
    ),
    blocs: z.array(
      z.object({
        id: z.string(),
        moyenne: z.number().nullable(),
        valideParNotes: z.boolean().nullable(),
        competences: z.object({ valide: z.boolean(), manquantes: z.array(z.string()) }).nullable(),
        valide: z.boolean().nullable(),
      }),
    ),
    moyenneGenerale: z.number().nullable(),
    admis: z.boolean().nullable(),
    mention: z.string().nullable(),
    ects: z.number(),
    explications: z.array(
      z.object({
        regleId: z.string(),
        libelle: z.string(),
        type: z.enum(TYPES_REGLE_PARTICULIERE),
        cible: z.record(z.string(), z.string()),
        avant: z.number(),
        apres: z.number(),
      }),
    ),
    anomalies: z.array(z.string()),
  })
  .meta({ id: 'ResultatSimulation' });
export type ResultatSimulation = z.infer<typeof ResultatSimulation>;

// ——— Import d'une maquette ou d'un référentiel de compétences (US-02-02, RG-02-21) ———

export const ParametresImportMaquette = z.object({
  type: z.enum(['maquette', 'competences']).default('maquette'),
  /** Vérifier sans rien enregistrer. */
  apercu: z.stringbool().default(false),
});
export type ParametresImportMaquette = z.infer<typeof ParametresImportMaquette>;

export const ResultatImportMaquette = z
  .object({
    apercu: z.boolean(),
    /** Vrai si le contenu a été ajouté à la maquette. */
    importe: z.boolean(),
    blocs: z.int(),
    ues: z.int(),
    modules: z.int(),
    competences: z.int(),
    /** Erreurs ligne par ligne (null : erreur qui ne tient pas à une ligne) ; rien n'est écrit. */
    erreurs: z.array(z.object({ ligne: z.int().nullable(), message: z.string() })),
    avertissements: z.array(z.string()),
    maquette: Maquette.nullable(),
  })
  .meta({ id: 'ResultatImportMaquette' });
export type ResultatImportMaquette = z.infer<typeof ResultatImportMaquette>;
