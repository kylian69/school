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

/** Heure locale HH:MM sur le pas de 15 minutes de la grille (RG-04-02). */
const heureGrille = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Heure au format HH:MM, par quart d’heure.');

/** RG-04-02 : valeurs en place avant le paramétrage par établissement. */
export const PLAGE_EDT_PAR_DEFAUT = {
  debut: '08:00',
  fin: '19:00',
  limiteMidi: '13:00',
  joursOuvres: [1, 2, 3, 4, 5],
};

/**
 * RG-04-02 : plage horaire et jours ouvrés de l'emploi du temps d'un établissement, et limite
 * matin / après-midi des demi-journées d'assiduité (RG-06-18).
 */
export const PlageEdt = z
  .object({
    debut: heureGrille,
    fin: heureGrille,
    limiteMidi: heureGrille,
    /** Jours ISO : lundi = 1 … dimanche = 7, sans doublon (l'API les trie). */
    joursOuvres: z
      .array(z.int().min(1).max(7))
      .min(1, 'Choisissez au moins un jour ouvré.')
      .max(7)
      .refine((jours) => new Set(jours).size === jours.length, 'Un jour est en double.'),
  })
  .refine((p) => p.fin > p.debut, {
    message: 'La fin de journée doit suivre le début.',
    path: ['fin'],
  })
  .refine((p) => p.limiteMidi > p.debut && p.limiteMidi < p.fin, {
    message: 'La limite matin / après-midi doit se trouver dans la plage horaire.',
    path: ['limiteMidi'],
  })
  .meta({ id: 'PlageEdt' });
export type PlageEdt = z.infer<typeof PlageEdt>;

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
    edt: PlageEdt,
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
    /** Modèle de matricule (RG-01-06) et exemple du prochain matricule. */
    modeleMatricule: z.string(),
    exempleMatricule: z.string(),
    /** RG-04-14 : jours d'affichage du badge « modifié » ; null : valeur par défaut. */
    edtBadgeModifieJours: z.int().nullable(),
    /** Valeur par défaut de l'instance, appliquée quand l'école n'a rien choisi. */
    edtBadgeModifieJoursDefaut: z.int(),
    etablissements: z.array(Etablissement),
  })
  .meta({ id: 'OrganisationDetail' });
export type OrganisationDetail = z.infer<typeof OrganisationDetail>;

export const ModificationOrganisation = z
  .object({
    nom: texte(120).optional(),
    nomAffichage: texte(40).optional(),
    siren: identifiant.optional(),
    /** Jetons {ANNEE}, {AA} et {NUM:n} ; null : numéro séquentiel par défaut. */
    modeleMatricule: z.string().trim().max(30).nullable().optional(),
    /** RG-04-14 : de 0 (jamais de badge) à 60 jours ; null : valeur par défaut de l'instance. */
    edtBadgeModifieJours: z.int().min(0).max(60).nullable().optional(),
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
  .object({ ...champsEtablissement, edt: PlageEdt })
  .partial()
  .meta({ id: 'ModificationEtablissement' });
export type ModificationEtablissement = z.infer<typeof ModificationEtablissement>;
