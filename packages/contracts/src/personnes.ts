import { z } from 'zod';

/** Contrats des écrans « Personnes » et « Fiche personne » (E-01-04, E-01-05 ; RG-01-06, RG-01-07). */

export const ETATS_COMPTE = ['cree', 'invite', 'actif', 'desactive'] as const;
export const CIVILITES = ['madame', 'monsieur'] as const;

const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');
const texte = (max: number) => z.string().trim().min(1, 'Ce champ est obligatoire.').max(max);
const facultatif = (max: number) => z.string().trim().max(max).nullable();

export const PersonneResume = z
  .object({
    id: z.uuid(),
    nom: z.string(),
    nomUsage: z.string().nullable(),
    prenom: z.string(),
    email: z.string(),
    compteEtat: z.enum(ETATS_COMPTE),
    /** Rôles en cours dans l'école. */
    roles: z.array(z.string()),
  })
  .meta({ id: 'PersonneResume' });
export type PersonneResume = z.infer<typeof PersonneResume>;

export const ListePersonnes = z
  .object({
    personnes: z.array(PersonneResume),
    total: z.int().min(0),
    page: z.int().min(1),
    parPage: z.int().min(1),
  })
  .meta({ id: 'ListePersonnes' });
export type ListePersonnes = z.infer<typeof ListePersonnes>;

/** Recherche, filtres et page de la liste (pagination côté serveur, module 01 section 9). */
export const RecherchePersonnes = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.uuid().optional(),
  etat: z.enum(ETATS_COMPTE).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  parPage: z.coerce.number().int().min(1).max(100).default(50),
});
export type RecherchePersonnes = z.infer<typeof RecherchePersonnes>;

export const PersonneDetail = z
  .object({
    id: z.uuid(),
    civilite: z.enum(CIVILITES).nullable(),
    nom: z.string(),
    nomUsage: z.string().nullable(),
    prenom: z.string(),
    email: z.string(),
    telephone: z.string().nullable(),
    adresseLigne1: z.string().nullable(),
    codePostal: z.string().nullable(),
    ville: z.string().nullable(),
    /** Date et lieu de naissance : null si la personne connectée ne peut pas les voir. */
    dateNaissance: jour.nullable(),
    lieuNaissance: z.string().nullable(),
    naissanceVisible: z.boolean(),
    /** RG-01-06 : attribué à la création, jamais réattribué. */
    matricule: z.string().nullable(),
    ine: z.string().nullable(),
    compteEtat: z.enum(ETATS_COMPTE),
    roles: z.array(z.string()),
    /** Version de la fiche : une modification concurrente est refusée (module 01, section 7). */
    version: z.string(),
  })
  .meta({ id: 'PersonneDetail' });
export type PersonneDetail = z.infer<typeof PersonneDetail>;

const champsIdentite = {
  civilite: z.enum(CIVILITES).nullable(),
  nom: texte(100),
  nomUsage: facultatif(100),
  prenom: texte(100),
  email: z.email('Adresse email invalide.').max(200),
  telephone: facultatif(30),
  adresseLigne1: facultatif(200),
  codePostal: facultatif(10),
  ville: facultatif(120),
  dateNaissance: jour.nullable(),
  lieuNaissance: facultatif(120),
  /** INE saisi avec ou sans espaces : l'API le normalise et le contrôle. */
  ine: facultatif(20),
};

export const NouvellePersonne = z
  .object({
    ...champsIdentite,
    civilite: champsIdentite.civilite.optional(),
    nomUsage: champsIdentite.nomUsage.optional(),
    telephone: champsIdentite.telephone.optional(),
    adresseLigne1: champsIdentite.adresseLigne1.optional(),
    codePostal: champsIdentite.codePostal.optional(),
    ville: champsIdentite.ville.optional(),
    dateNaissance: champsIdentite.dateNaissance.optional(),
    lieuNaissance: champsIdentite.lieuNaissance.optional(),
    ine: champsIdentite.ine.optional(),
    /** Matricule repris d'un autre logiciel (import) ; sinon généré selon le modèle de l'école. */
    matricule: z.string().trim().min(1).max(30).optional(),
    /** RG-01-07 : créer malgré une fiche de même identité, après l'avoir vérifiée. */
    ignorerDoublons: z.boolean().optional(),
  })
  .meta({ id: 'NouvellePersonne' });
export type NouvellePersonne = z.infer<typeof NouvellePersonne>;

export const ModificationPersonne = z
  .object({ ...champsIdentite, version: z.string() })
  .partial()
  .required({ version: true })
  .meta({ id: 'ModificationPersonne' });
export type ModificationPersonne = z.infer<typeof ModificationPersonne>;

/** Fiche existante proposée à la place d'une création (RG-01-07). */
export const DoublonPersonne = z.object({
  id: z.uuid(),
  nom: z.string(),
  prenom: z.string(),
  email: z.string(),
  motifs: z.array(z.enum(['email', 'ine', 'identite'])),
});
export type DoublonPersonne = z.infer<typeof DoublonPersonne>;

/** Rôle d'une personne, avec son périmètre et sa période (US-01-09 ; RG-01-14). */
export const AttributionPersonne = z
  .object({
    id: z.uuid(),
    roleId: z.uuid(),
    roleLibelle: z.string(),
    perimetreType: z.enum(['organisation', 'etablissement', 'formation', 'promotion', 'soi']),
    perimetreId: z.uuid().nullable(),
    /** Nom de l'établissement, de la formation ou de la promotion ; null sinon. */
    perimetreLibelle: z.string().nullable(),
    debut: jour,
    fin: jour.nullable(),
    statut: z.enum(['en-cours', 'a-venir', 'terminee']),
  })
  .meta({ id: 'AttributionPersonne' });
export type AttributionPersonne = z.infer<typeof AttributionPersonne>;

export const ListeAttributions = z
  .object({ attributions: z.array(AttributionPersonne) })
  .meta({ id: 'ListeAttributions' });
export type ListeAttributions = z.infer<typeof ListeAttributions>;

export const NouvelleAttribution = z
  .object({
    roleId: z.uuid(),
    perimetreType: z.enum(['organisation', 'etablissement', 'formation', 'promotion', 'soi']),
    perimetreId: z.uuid().nullable().optional(),
    /** Début : aujourd'hui par défaut. */
    debut: jour.optional(),
    fin: jour.nullable().optional(),
  })
  .meta({ id: 'NouvelleAttribution' });
export type NouvelleAttribution = z.infer<typeof NouvelleAttribution>;

/** Actions en masse depuis la liste (E-01-04 ; US-01-06, US-01-12). */
export const ActionsPersonnes = z
  .object({
    action: z.enum(['inviter', 'desactiver', 'reactiver']),
    personneIds: z.array(z.uuid()).min(1).max(500),
  })
  .meta({ id: 'ActionsPersonnes' });
export type ActionsPersonnes = z.infer<typeof ActionsPersonnes>;

export const ResultatActions = z
  .object({
    reussies: z.int().min(0),
    /** Personnes pour lesquelles l'action n'a pas abouti, avec la raison. */
    echecs: z.array(z.object({ personneId: z.uuid(), nom: z.string(), message: z.string() })),
  })
  .meta({ id: 'ResultatActions' });
export type ResultatActions = z.infer<typeof ResultatActions>;

/** Export de plus de 100 personnes : envoyé par email (RG-01-21). */
export const ExportDiffere = z
  .object({ total: z.int(), message: z.string() })
  .meta({ id: 'ExportDiffere' });
export type ExportDiffere = z.infer<typeof ExportDiffere>;
