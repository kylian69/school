import { z } from 'zod';

/**
 * Contrats des promotions, groupes et inscriptions (module 02 : E-02-04 « Promotions de l'année »,
 * E-02-05 « Promotion » ; US-02-06, US-02-07, US-02-12, RG-02-12 à RG-02-17).
 */
const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');
const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);

export const ETATS_INSCRIPTION = [
  'preinscrit',
  'inscrit',
  'demissionnaire',
  'exclu',
  'diplome',
] as const;
export const STATUTS_APPRENANT = [
  'initial',
  'apprenti',
  'professionnalisation',
  'formation_continue',
] as const;
export const TYPES_GROUPE = ['td', 'tp', 'option', 'langue', 'autre'] as const;

export const Promotion = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    formation: z.object({ id: z.uuid(), intitule: z.string(), dureeAnnees: z.int() }),
    version: z.object({ id: z.uuid(), numero: z.int() }),
    anneeFormation: z.int(),
    anneeScolaire: z.object({ id: z.uuid(), libelle: z.string() }),
    etablissement: z.object({ id: z.uuid(), nom: z.string() }),
    dateDebut: jour,
    dateFin: jour,
    /** Inscriptions actives aujourd'hui, par statut, et pré-inscriptions. */
    effectifs: z.object({
      inscrits: z.int(),
      preinscrits: z.int(),
      parStatut: z.record(z.enum(STATUTS_APPRENANT), z.int()),
    }),
    modifiable: z.boolean(),
  })
  .meta({ id: 'Promotion' });
export type Promotion = z.infer<typeof Promotion>;

export const ListePromotions = z
  .object({ promotions: z.array(Promotion), creation: z.boolean() })
  .meta({ id: 'ListePromotions' });
export type ListePromotions = z.infer<typeof ListePromotions>;

export const RecherchePromotions = z.object({
  anneeScolaireId: z.uuid().optional(),
  formationId: z.uuid().optional(),
  etablissementId: z.uuid().optional(),
});
export type RecherchePromotions = z.infer<typeof RecherchePromotions>;

export const NouvellePromotion = z
  .object({
    formationId: z.uuid(),
    anneeFormation: z.int().min(1).max(8),
    anneeScolaireId: z.uuid(),
    etablissementId: z.uuid(),
    /** Par défaut : la dernière version publiée de la maquette. */
    versionId: z.uuid().optional(),
    /** Par défaut : formation, année de formation et année scolaire. */
    libelle: texte(200).optional(),
    /** Par défaut : les dates de l'année scolaire (une promotion peut en déborder, RG-02-12). */
    dateDebut: jour.optional(),
    dateFin: jour.optional(),
  })
  .meta({ id: 'NouvellePromotion' });
export type NouvellePromotion = z.infer<typeof NouvellePromotion>;

export const ModificationPromotion = z
  .object({
    libelle: texte(200).optional(),
    dateDebut: jour.optional(),
    dateFin: jour.optional(),
    /** RG-02-05 : droit spécifique et confirmation explicite. */
    versionId: z.uuid().optional(),
    confirmation: z.boolean().optional(),
  })
  .meta({ id: 'ModificationPromotion' });
export type ModificationPromotion = z.infer<typeof ModificationPromotion>;

const Periode = z.object({ debut: jour, fin: jour.nullable() });

export const Groupe = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    type: z.enum(TYPES_GROUPE),
    capacite: z.int().nullable(),
    option: z.string().nullable(),
    promotionIds: z.array(z.uuid()),
    /** Membres à la date du jour. */
    effectif: z.int(),
  })
  .meta({ id: 'Groupe' });
export type Groupe = z.infer<typeof Groupe>;

export const SaisieGroupe = z
  .object({
    libelle: texte(80),
    type: z.enum(TYPES_GROUPE),
    capacite: z.int().min(1).max(2000).nullable().default(null),
    option: z.string().trim().max(60).nullable().default(null),
    /** Autres promotions d'un groupe transversal (US-02-12). */
    autresPromotionIds: z.array(z.uuid()).max(30).default([]),
  })
  .meta({ id: 'SaisieGroupe' });
export type SaisieGroupe = z.infer<typeof SaisieGroupe>;

export const ModificationGroupe = z
  .object({
    libelle: texte(80),
    capacite: z.int().min(1).max(2000).nullable(),
    option: z.string().trim().max(60).nullable(),
  })
  .partial()
  .meta({ id: 'ModificationGroupe' });
export type ModificationGroupe = z.infer<typeof ModificationGroupe>;

export const Inscription = z
  .object({
    id: z.uuid(),
    promotionId: z.uuid(),
    personne: z.object({
      id: z.uuid(),
      nom: z.string(),
      prenom: z.string(),
      matricule: z.string().nullable(),
    }),
    etat: z.enum(ETATS_INSCRIPTION),
    dateEntree: jour,
    dateSortie: jour.nullable(),
    motifSortie: z.string().nullable(),
    option: z.string().nullable(),
    /** Statut à la date du jour, et son historique (section 7). */
    statut: z.enum(STATUTS_APPRENANT).nullable(),
    statuts: z.array(Periode.extend({ statut: z.enum(STATUTS_APPRENANT) })),
    groupes: z.array(Periode.extend({ groupeId: z.uuid() })),
  })
  .meta({ id: 'Inscription' });
export type Inscription = z.infer<typeof Inscription>;

export const DetailPromotion = Promotion.extend({
  groupes: z.array(Groupe),
  inscriptions: z.array(Inscription),
  /** Options de la maquette suivie (RG-02-15). */
  options: z.array(z.string()),
  changementVersion: z.boolean(),
  versionsDisponibles: z.array(z.object({ id: z.uuid(), numero: z.int() })),
}).meta({ id: 'DetailPromotion' });
export type DetailPromotion = z.infer<typeof DetailPromotion>;

export const NouvelleInscription = z
  .object({
    personneId: z.uuid(),
    statut: z.enum(STATUTS_APPRENANT),
    etat: z.enum(['preinscrit', 'inscrit']).default('inscrit'),
    /** Par défaut : le début de la promotion. */
    dateEntree: jour.optional(),
    option: z.string().trim().max(60).nullable().default(null),
  })
  .meta({ id: 'NouvelleInscription' });
export type NouvelleInscription = z.infer<typeof NouvelleInscription>;

export const ModificationInscription = z
  .object({
    etat: z.enum(ETATS_INSCRIPTION),
    dateEntree: jour,
    dateSortie: jour.nullable(),
    motifSortie: z.string().trim().max(300).nullable(),
    option: z.string().trim().max(60).nullable(),
  })
  .partial()
  .meta({ id: 'ModificationInscription' });
export type ModificationInscription = z.infer<typeof ModificationInscription>;

/** Section 7 : nouvelle période de statut, à la date de début du contrat. */
export const ChangementStatut = z
  .object({ statut: z.enum(STATUTS_APPRENANT), debut: jour })
  .meta({ id: 'ChangementStatut' });
export type ChangementStatut = z.infer<typeof ChangementStatut>;

/**
 * Ajout de membres à un groupe à une date d'effet : un apprenant déjà dans un groupe du même type
 * de sa promotion le quitte ce jour-là (changement de groupe, section 7).
 */
export const AjoutMembres = z
  .object({
    inscriptionIds: z.array(z.uuid()).min(1).max(2000),
    date: jour.optional(),
    /** Section 7 : dépasser la capacité, réservé à un responsable, tracé. */
    forcer: z.boolean().default(false),
  })
  .meta({ id: 'AjoutMembres' });
export type AjoutMembres = z.infer<typeof AjoutMembres>;

export const RetraitMembre = z
  .object({ inscriptionId: z.uuid(), date: jour.optional() })
  .meta({ id: 'RetraitMembre' });
export type RetraitMembre = z.infer<typeof RetraitMembre>;

export const SaisieRepartition = z
  .object({
    groupeIds: z.array(z.uuid()).min(1).max(50),
    methode: z.enum(['alphabetique', 'equilibre', 'critere']),
    critere: z.enum(['statut', 'option']).optional(),
    date: jour.optional(),
    /** Vrai : proposer seulement, sans rien écrire. */
    apercu: z.boolean().default(false),
  })
  .meta({ id: 'SaisieRepartition' });
export type SaisieRepartition = z.infer<typeof SaisieRepartition>;

export const ResultatRepartition = z
  .object({
    affectations: z.array(z.object({ inscriptionId: z.uuid(), groupeId: z.uuid() })),
    nonAffectes: z.array(z.uuid()),
    applique: z.boolean(),
  })
  .meta({ id: 'ResultatRepartition' });
export type ResultatRepartition = z.infer<typeof ResultatRepartition>;

// ——— Salles (RG-02-19, E-02-06) ———

export const TYPES_SALLE = [
  'cours',
  'tp_informatique',
  'laboratoire',
  'amphitheatre',
  'virtuelle',
] as const;

export const Salle = z
  .object({
    id: z.uuid(),
    etablissementId: z.uuid(),
    nom: z.string(),
    capacite: z.int().nullable(),
    type: z.enum(TYPES_SALLE),
    equipements: z.array(z.string()),
    pmr: z.boolean(),
    statut: z.enum(['disponible', 'fermee']),
    modifiable: z.boolean(),
  })
  .meta({ id: 'Salle' });
export type Salle = z.infer<typeof Salle>;

export const ListeSalles = z
  .object({ salles: z.array(Salle), creation: z.boolean() })
  .meta({ id: 'ListeSalles' });
export type ListeSalles = z.infer<typeof ListeSalles>;

export const RechercheSalles = z.object({
  etablissementId: z.uuid().optional(),
  capaciteMin: z.coerce.number().int().min(1).optional(),
  equipement: z.string().trim().max(60).optional(),
  type: z.enum(TYPES_SALLE).optional(),
});
export type RechercheSalles = z.infer<typeof RechercheSalles>;

export const SaisieSalle = z
  .object({
    etablissementId: z.uuid(),
    nom: texte(80),
    capacite: z.int().min(1).max(5000).nullable().default(null),
    type: z.enum(TYPES_SALLE).default('cours'),
    equipements: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    pmr: z.boolean().default(false),
    statut: z.enum(['disponible', 'fermee']).default('disponible'),
  })
  .meta({ id: 'SaisieSalle' });
export type SaisieSalle = z.infer<typeof SaisieSalle>;

export const ModificationSalle = z
  .object({
    nom: texte(80),
    capacite: z.int().min(1).max(5000).nullable(),
    type: z.enum(TYPES_SALLE),
    equipements: z.array(z.string().trim().min(1).max(60)).max(30),
    pmr: z.boolean(),
    statut: z.enum(['disponible', 'fermee']),
  })
  .partial()
  .meta({ id: 'ModificationSalle' });
export type ModificationSalle = z.infer<typeof ModificationSalle>;

// ——— Affectations des intervenants (RG-02-18) ———

const HeuresAffectees = z.object({
  cm: z.number(),
  td: z.number(),
  tp: z.number(),
  projet: z.number(),
  elearning: z.number(),
});
const SaisieHeuresAffectees = z.object({
  cm: z.number().min(0).max(2000).default(0),
  td: z.number().min(0).max(2000).default(0),
  tp: z.number().min(0).max(2000).default(0),
  projet: z.number().min(0).max(2000).default(0),
  elearning: z.number().min(0).max(2000).default(0),
});

export const Affectation = z
  .object({
    id: z.uuid(),
    promotionId: z.uuid(),
    moduleId: z.uuid(),
    intervenant: z.object({ id: z.uuid(), nom: z.string(), prenom: z.string() }),
    groupeIds: z.array(z.uuid()),
    heures: HeuresAffectees,
  })
  .meta({ id: 'Affectation' });
export type Affectation = z.infer<typeof Affectation>;

export const AffectationsPromotion = z
  .object({
    affectations: z.array(Affectation),
    /** Modules de la maquette suivie, avec le volume prévu, le volume affecté et les écarts. */
    modules: z.array(
      z.object({
        id: z.uuid(),
        code: z.string(),
        intitule: z.string(),
        ueCode: z.string(),
        prevu: HeuresAffectees,
        affecte: HeuresAffectees,
        ecarts: z.array(
          z.object({
            type: z.enum(['cm', 'td', 'tp', 'projet', 'elearning']),
            prevu: z.number(),
            affecte: z.number(),
            ecart: z.number(),
          }),
        ),
      }),
    ),
    modifiable: z.boolean(),
  })
  .meta({ id: 'AffectationsPromotion' });
export type AffectationsPromotion = z.infer<typeof AffectationsPromotion>;

export const SaisieAffectation = z
  .object({
    personneId: z.uuid(),
    moduleId: z.uuid(),
    groupeIds: z.array(z.uuid()).max(30).default([]),
    heures: SaisieHeuresAffectees.prefault({}),
  })
  .meta({ id: 'SaisieAffectation' });
export type SaisieAffectation = z.infer<typeof SaisieAffectation>;

export const ModificationAffectation = z
  .object({ groupeIds: z.array(z.uuid()).max(30), heures: SaisieHeuresAffectees })
  .partial()
  .meta({ id: 'ModificationAffectation' });
export type ModificationAffectation = z.infer<typeof ModificationAffectation>;

/** E-02-08 · Mes enseignements : modules, groupes et heures prévues de l'intervenant. */
export const MesEnseignements = z
  .object({
    enseignements: z.array(
      z.object({
        affectationId: z.uuid(),
        promotion: z.object({ id: z.uuid(), libelle: z.string() }),
        module: z.object({ code: z.string(), intitule: z.string() }),
        groupes: z.array(z.string()),
        heures: HeuresAffectees,
        /** Heures réalisées : avec l'emploi du temps (module 04). */
        realisees: HeuresAffectees.nullable(),
      }),
    ),
    totalHeures: z.number(),
  })
  .meta({ id: 'MesEnseignements' });
export type MesEnseignements = z.infer<typeof MesEnseignements>;
