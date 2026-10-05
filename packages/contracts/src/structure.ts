import { z } from 'zod';

/** Contrats de l'écran « Organisation et établissements » (E-01-02 ; US-01-02, RG-01-01, RG-01-02). */

const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);
/** Champ facultatif : null ou une chaîne vide l'efface. */
const facultatif = (max: number) => z.string().trim().max(max).nullable();
/**
 * Identifiant saisi avec ou sans espaces : l'API le normalise, puis contrôle son format et sa clé
 * (RG-01-02).
 */
const identifiant = facultatif(20);

export const FUSEAU_PAR_DEFAUT = 'Europe/Paris';

/** Fuseau horaire IANA reconnu par le moteur JavaScript (dates affichées, conventions). */
const fuseauHoraire = z
  .string()
  .refine(
    (fuseau) => fuseau === 'UTC' || Intl.supportedValuesOf('timeZone').includes(fuseau),
    'Fuseau horaire inconnu. Choisissez-en un dans la liste.',
  );

export const INFORMATIONS_MANQUANTES = ['adresse', 'uai', 'siret', 'nda'] as const;

export const Etablissement = z
  .object({
    id: z.uuid(),
    nom: z.string(),
    adresseLigne1: z.string().nullable(),
    adresseLigne2: z.string().nullable(),
    codePostal: z.string().nullable(),
    ville: z.string().nullable(),
    uai: z.string().nullable(),
    siret: z.string().nullable(),
    nda: z.string().nullable(),
    fuseauHoraire: z.string(),
    telephone: z.string().nullable(),
    email: z.string().nullable(),
    statut: z.enum(['actif', 'archive']),
    /** RG-01-02 : informations reprises par les documents officiels, encore absentes. */
    manquantes: z.array(z.enum(INFORMATIONS_MANQUANTES)),
  })
  .meta({ id: 'Etablissement' });
export type Etablissement = z.infer<typeof Etablissement>;

export const OrganisationDetail = z
  .object({
    id: z.uuid(),
    nom: z.string(),
    nomAffichage: z.string(),
    siren: z.string().nullable(),
    etablissements: z.array(Etablissement),
  })
  .meta({ id: 'OrganisationDetail' });
export type OrganisationDetail = z.infer<typeof OrganisationDetail>;

export const ModificationOrganisation = z
  .object({
    nom: texte(120).optional(),
    nomAffichage: texte(40).optional(),
    siren: identifiant.optional(),
  })
  .meta({ id: 'ModificationOrganisation' });
export type ModificationOrganisation = z.infer<typeof ModificationOrganisation>;

/**
 * Saisie d'un établissement : les 5 champs du premier établissement (nom, adresse, code postal,
 * ville, fuseau) sont obligatoires, le reste peut attendre (parcours de première configuration).
 */
const champsEtablissement = {
  nom: texte(120),
  adresseLigne1: texte(200),
  adresseLigne2: facultatif(200).optional(),
  codePostal: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z -]{3,10}$/, 'Code postal invalide.'),
  ville: texte(120),
  fuseauHoraire,
  uai: identifiant.optional(),
  siret: identifiant.optional(),
  nda: identifiant.optional(),
  telephone: facultatif(30).optional(),
  email: z
    .union([z.email('Adresse email invalide.'), z.literal('')])
    .nullable()
    .optional(),
};

export const NouvelEtablissement = z
  .object({ ...champsEtablissement, fuseauHoraire: fuseauHoraire.default(FUSEAU_PAR_DEFAUT) })
  .meta({ id: 'NouvelEtablissement' });
export type NouvelEtablissement = z.infer<typeof NouvelEtablissement>;

export const ModificationEtablissement = z
  .object(champsEtablissement)
  .partial()
  .meta({ id: 'ModificationEtablissement' });
export type ModificationEtablissement = z.infer<typeof ModificationEtablissement>;
