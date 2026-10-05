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
  motifs: z.array(z.enum(['email', 'identite'])),
});
export type DoublonPersonne = z.infer<typeof DoublonPersonne>;
