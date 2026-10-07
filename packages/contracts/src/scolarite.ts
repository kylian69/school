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
