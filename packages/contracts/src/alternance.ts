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
