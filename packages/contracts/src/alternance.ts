import { z } from 'zod';

/**
 * Contrats du module 03 (alternance et stages) : entreprises (E-03-01, E-03-02), contacts et
 * tuteurs (RG-03-01 à RG-03-04).
 */
const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');
const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);
const facultatif = (max: number) => z.string().trim().max(max).nullable();

export const TYPES_CONTACT = ['rh', 'dirigeant', 'tuteur', 'autre'] as const;

export const Opco = z.object({ code: z.string(), libelle: z.string() }).meta({ id: 'Opco' });
export type Opco = z.infer<typeof Opco>;
export const ListeOpcos = z.object({ opcos: z.array(Opco) }).meta({ id: 'ListeOpcos' });
export type ListeOpcos = z.infer<typeof ListeOpcos>;

export const ContactEntreprise = z
  .object({
    id: z.uuid(),
    personne: z.object({
      id: z.uuid(),
      nom: z.string(),
      prenom: z.string(),
      email: z.string(),
      compteEtat: z.enum(['cree', 'invite', 'actif', 'desactive']),
    }),
    type: z.enum(TYPES_CONTACT),
    fonction: z.string().nullable(),
    dansEntrepriseDepuis: jour.nullable(),
  })
  .meta({ id: 'ContactEntreprise' });
export type ContactEntreprise = z.infer<typeof ContactEntreprise>;

export const Entreprise = z
  .object({
    id: z.uuid(),
    siret: z.string(),
    siren: z.string(),
    raisonSociale: z.string(),
    adresse: z.string().nullable(),
    codePostal: z.string().nullable(),
    ville: z.string().nullable(),
    naf: z.string().nullable(),
    effectif: z.string().nullable(),
    idcc: z.string().nullable(),
    opco: z.string().nullable(),
    statut: z.enum(['active', 'fermee']),
    aVerifier: z.boolean(),
    contacts: z.array(ContactEntreprise),
    modifiable: z.boolean(),
  })
  .meta({ id: 'Entreprise' });
export type Entreprise = z.infer<typeof Entreprise>;

export const ListeEntreprises = z
  .object({
    entreprises: z.array(Entreprise.omit({ contacts: true }).extend({ tuteurs: z.int() })),
    creation: z.boolean(),
  })
  .meta({ id: 'ListeEntreprises' });
export type ListeEntreprises = z.infer<typeof ListeEntreprises>;

export const RechercheEntreprises = z.object({
  q: z.string().trim().max(100).optional(),
  opco: z.string().max(40).optional(),
  ville: z.string().trim().max(80).optional(),
});
export type RechercheEntreprises = z.infer<typeof RechercheEntreprises>;

/** Résultat de la recherche par SIRET (RG-03-01, section 7). */
export const RechercheSiret = z
  .object({
    siret: z.string(),
    /** Entreprise déjà enregistrée dans l'école avec ce SIRET. */
    existante: z.uuid().nullable(),
    annuaire: z.enum(['trouve', 'introuvable', 'indisponible']),
    fiche: z
      .object({
        siren: z.string(),
        raisonSociale: z.string(),
        adresse: z.string().nullable(),
        codePostal: z.string().nullable(),
        ville: z.string().nullable(),
        naf: z.string().nullable(),
        effectif: z.string().nullable(),
        ferme: z.boolean(),
        idcc: z.string().nullable(),
        opcoPropose: z.string().nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'RechercheSiret' });
export type RechercheSiret = z.infer<typeof RechercheSiret>;

/**
 * Création par SIRET : l'API relit l'annuaire et complète les champs ; sans annuaire, la raison
 * sociale est obligatoire et l'entreprise est marquée « à vérifier ».
 */
export const NouvelleEntreprise = z
  .object({
    siret: z
      .string()
      .trim()
      .overwrite((v) => v.replace(/\s+/g, '')),
    raisonSociale: z.string().trim().max(200).optional(),
    adresse: facultatif(200).optional(),
    codePostal: facultatif(10).optional(),
    ville: facultatif(80).optional(),
    idcc: facultatif(10).optional(),
    opco: facultatif(40).optional(),
  })
  .meta({ id: 'NouvelleEntreprise' });
export type NouvelleEntreprise = z.infer<typeof NouvelleEntreprise>;

export const ModificationEntreprise = z
  .object({
    raisonSociale: texte(200),
    adresse: facultatif(200),
    codePostal: facultatif(10),
    ville: facultatif(80),
    idcc: facultatif(10),
    opco: facultatif(40),
    statut: z.enum(['active', 'fermee']),
  })
  .partial()
  .meta({ id: 'ModificationEntreprise' });
export type ModificationEntreprise = z.infer<typeof ModificationEntreprise>;

/** Contact d'une entreprise : une fiche existante, ou une nouvelle personne (un tuteur, souvent). */
export const NouveauContact = z
  .object({
    personneId: z.uuid().optional(),
    personne: z
      .object({
        nom: texte(100),
        prenom: texte(100),
        email: z.email('Adresse email invalide.').max(200),
      })
      .optional(),
    type: z.enum(TYPES_CONTACT),
    fonction: facultatif(120).default(null),
    dansEntrepriseDepuis: jour.nullable().default(null),
  })
  .meta({ id: 'NouveauContact' });
export type NouveauContact = z.infer<typeof NouveauContact>;

export const ModificationContact = z
  .object({
    type: z.enum(TYPES_CONTACT),
    fonction: facultatif(120),
    dansEntrepriseDepuis: jour.nullable(),
  })
  .partial()
  .meta({ id: 'ModificationContact' });
export type ModificationContact = z.infer<typeof ModificationContact>;

// ——— Contrats d'alternance (RG-03-05 à RG-03-09) et conventions de stage (RG-03-22 à RG-03-24) ———

export const TYPES_CONTRAT = ['apprentissage', 'professionnalisation', 'autre'] as const;
export const STATUTS_CONTRAT = ['brouillon', 'signe', 'en_cours', 'termine', 'rompu'] as const;
export const MOTIFS_RUPTURE = [
  'periode_essai',
  'accord_commun',
  'demission',
  'licenciement',
  'autre',
] as const;
export const STATUTS_CONVENTION = [
  'brouillon',
  'signee',
  'en_cours',
  'terminee',
  'annulee',
] as const;

/** Taille maximale du contrat ou de la convention signés (PDF). */
export const DOCUMENT_CONTRAT_TAILLE_MAX = 10 * 1024 * 1024;

const PersonneResumee = z.object({
  id: z.uuid(),
  nom: z.string(),
  prenom: z.string(),
  email: z.string(),
  compteEtat: z.enum(['cree', 'invite', 'actif', 'desactive']),
});

const Apprenant = z.object({
  personneId: z.uuid(),
  nom: z.string(),
  prenom: z.string(),
  inscriptionId: z.uuid(),
  promotion: z.object({ id: z.uuid(), libelle: z.string() }),
});

const EntrepriseResumee = z.object({
  id: z.uuid(),
  raisonSociale: z.string(),
  siret: z.string(),
  statut: z.enum(['active', 'fermee']),
});

export const TuteurContrat = z
  .object({
    id: z.uuid(),
    personne: PersonneResumee,
    debut: jour,
    /** Fin exclue : le tuteur perd l'accès ce jour-là. */
    fin: jour.nullable(),
  })
  .meta({ id: 'TuteurContrat' });
export type TuteurContrat = z.infer<typeof TuteurContrat>;

/** Avertissements non bloquants (section 7, RG-03-04). */
export const AvertissementContrat = z
  .object({
    type: z.enum(['entreprise-fermee', 'entreprise-a-verifier', 'capacite-maitre']),
    tuteurId: z.uuid().nullable(),
  })
  .meta({ id: 'AvertissementContrat' });
export type AvertissementContrat = z.infer<typeof AvertissementContrat>;

export const Contrat = z
  .object({
    id: z.uuid(),
    apprenant: Apprenant,
    entreprise: EntrepriseResumee,
    type: z.enum(TYPES_CONTRAT),
    debut: jour,
    fin: jour,
    opco: z.string().nullable(),
    numeroDepot: z.string().nullable(),
    statut: z.enum(STATUTS_CONTRAT),
    referent: PersonneResumee.nullable(),
    formationProlongee: z.boolean(),
    rupture: z
      .object({
        date: jour,
        motif: z.enum(MOTIFS_RUPTURE),
        sansEmployeurJusquau: jour.nullable(),
      })
      .nullable(),
    document: z.boolean(),
    tuteurs: z.array(TuteurContrat),
    avertissements: z.array(AvertissementContrat),
    modifiable: z.boolean(),
  })
  .meta({ id: 'Contrat' });
export type Contrat = z.infer<typeof Contrat>;

/** RG-03-23 : contrôles légaux d'une convention (seuils des tables datées). */
export const ControleStage = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('gratification-obligatoire'),
      heures: z.number(),
      seuil: z.number(),
    }),
    z.object({
      type: z.literal('gratification-insuffisante'),
      montant: z.int(),
      minimum: z.int(),
    }),
    z.object({ type: z.literal('duree-maximale'), heures: z.number(), maximum: z.number() }),
  ])
  .meta({ id: 'ControleStage' });
export type ControleStage = z.infer<typeof ControleStage>;

export const ConventionStage = z
  .object({
    id: z.uuid(),
    apprenant: Apprenant,
    entreprise: EntrepriseResumee,
    tuteur: PersonneResumee.nullable(),
    referent: PersonneResumee,
    debut: jour,
    fin: jour,
    heuresPresence: z.number(),
    missions: z.string().nullable(),
    /** Centimes par heure ; null : pas de gratification. */
    gratificationHoraire: z.int().nullable(),
    statut: z.enum(STATUTS_CONVENTION),
    derogationMotif: z.string().nullable(),
    document: z.boolean(),
    controles: z.array(ControleStage),
    modifiable: z.boolean(),
  })
  .meta({ id: 'ConventionStage' });
export type ConventionStage = z.infer<typeof ConventionStage>;

/** E-03-03 : contrats et conventions, par type et statut. */
export const ListeContrats = z
  .object({
    contrats: z.array(Contrat.omit({ tuteurs: true })),
    conventions: z.array(ConventionStage),
    creation: z.boolean(),
  })
  .meta({ id: 'ListeContrats' });
export type ListeContrats = z.infer<typeof ListeContrats>;

export const RechercheContrats = z.object({
  personneId: z.uuid().optional(),
  entrepriseId: z.uuid().optional(),
  promotionId: z.uuid().optional(),
});
export type RechercheContrats = z.infer<typeof RechercheContrats>;

export const NouveauContrat = z
  .object({
    inscriptionId: z.uuid(),
    entrepriseId: z.uuid(),
    type: z.enum(TYPES_CONTRAT),
    debut: jour,
    fin: jour,
    /** Par défaut : l'OPCO de l'entreprise. */
    opco: facultatif(40).optional(),
    numeroDepot: facultatif(40).default(null),
    referentId: z.uuid().nullable().default(null),
    formationProlongee: z.boolean().default(false),
    /** Un ou deux tuteurs, contacts « tuteur » de l'entreprise (RG-03-05). */
    tuteurIds: z.array(z.uuid()).min(1, 'Choisissez un tuteur.').max(2, 'Deux tuteurs au plus.'),
  })
  .meta({ id: 'NouveauContrat' });
export type NouveauContrat = z.infer<typeof NouveauContrat>;

export const ModificationContrat = z
  .object({
    debut: jour,
    fin: jour,
    opco: facultatif(40),
    numeroDepot: facultatif(40),
    referentId: z.uuid().nullable(),
    formationProlongee: z.boolean(),
    /** RG-03-05 : brouillon → signé → en cours → terminé (la rupture a sa propre route). */
    statut: z.enum(['brouillon', 'signe', 'en_cours', 'termine']),
  })
  .partial()
  .meta({ id: 'ModificationContrat' });
export type ModificationContrat = z.infer<typeof ModificationContrat>;

/** Section 7 : nouveau tuteur à une date d'effet ; l'ancien, s'il est remplacé, perd l'accès ce jour-là. */
export const ChangementTuteur = z
  .object({
    personneId: z.uuid(),
    date: jour,
    remplace: z.uuid().nullable().default(null),
  })
  .meta({ id: 'ChangementTuteur' });
export type ChangementTuteur = z.infer<typeof ChangementTuteur>;

export const RuptureContrat = z
  .object({
    date: jour,
    motif: z.enum(MOTIFS_RUPTURE),
    /** RG-03-07 : l'apprenti poursuit sa formation sans employeur (durée de la table datée). */
    poursuiteSansEmployeur: z.boolean().default(false),
  })
  .meta({ id: 'RuptureContrat' });
export type RuptureContrat = z.infer<typeof RuptureContrat>;

export const NouvelleConvention = z
  .object({
    inscriptionId: z.uuid(),
    entrepriseId: z.uuid(),
    tuteurId: z.uuid().nullable().default(null),
    referentId: z.uuid(),
    debut: jour,
    fin: jour,
    heuresPresence: z.number().positive('La durée de présence est positive.').max(10_000),
    missions: facultatif(4000).default(null),
    gratificationHoraire: z.int().min(0).nullable().default(null),
    /** Section 7 : dérogation tracée à l'obligation de gratification. */
    derogationMotif: facultatif(500).default(null),
  })
  .meta({ id: 'NouvelleConvention' });
export type NouvelleConvention = z.infer<typeof NouvelleConvention>;

export const ModificationConvention = z
  .object({
    tuteurId: z.uuid().nullable(),
    referentId: z.uuid(),
    debut: jour,
    fin: jour,
    heuresPresence: z.number().positive().max(10_000),
    missions: facultatif(4000),
    gratificationHoraire: z.int().min(0).nullable(),
    derogationMotif: facultatif(500),
    statut: z.enum(STATUTS_CONVENTION),
  })
  .partial()
  .meta({ id: 'ModificationConvention' });
export type ModificationConvention = z.infer<typeof ModificationConvention>;

/** Lien de téléchargement signé du document (quelques minutes). */
export const LienDocument = z.object({ url: z.string() }).meta({ id: 'LienDocument' });
export type LienDocument = z.infer<typeof LienDocument>;
