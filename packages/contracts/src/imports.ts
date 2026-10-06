import { z } from 'zod';

/** Contrats de l'assistant d'import (E-01-06 ; US-01-05, RG-01-17 à RG-01-20). */

export const TYPES_IMPORT = ['apprenants', 'intervenants', 'personnel'] as const;
export type TypeImport = (typeof TYPES_IMPORT)[number];

/** Champs d'une fiche qu'un import peut renseigner (mêmes valeurs que le domaine). */
export const CHAMPS_IMPORT = [
  'civilite',
  'nom',
  'nomUsage',
  'prenom',
  'email',
  'telephone',
  'adresseLigne1',
  'codePostal',
  'ville',
  'dateNaissance',
  'lieuNaissance',
  'ine',
  'matricule',
] as const;
export type ChampImport = (typeof CHAMPS_IMPORT)[number];

/** Formats acceptés, par type de contenu envoyé (RG-01-17). */
export const TYPES_FICHIER_IMPORT = {
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
} as const;
/** Taille maximale d'un fichier d'import, soit environ 20 000 lignes (RG-01-17). */
export const IMPORT_TAILLE_MAX = 10 * 1024 * 1024;

const champ = z.enum(CHAMPS_IMPORT);

export const ProblemeImport = z.object({
  champ,
  message: z.string(),
  /** Valeur retenue après interprétation (avertissement). */
  valeur: z.string().optional(),
});

export const LigneApercu = z.object({
  /** Numéro de la ligne dans le fichier (l'en-tête est la ligne 1). */
  numero: z.int().min(2),
  donnees: z.partialRecord(champ, z.string()),
  erreurs: z.array(ProblemeImport),
  avertissements: z.array(ProblemeImport),
});
export type LigneApercu = z.infer<typeof LigneApercu>;

export const ApercuImport = z
  .object({
    id: z.uuid(),
    type: z.enum(TYPES_IMPORT),
    statut: z.enum(['en_preparation', 'valide', 'annule']),
    fichierNom: z.string(),
    colonnes: z.array(z.string()),
    correspondance: z.record(z.string(), champ.nullable()),
    /** Champs obligatoires sans colonne associée : l'import ne peut pas être validé. */
    champsManquants: z.array(champ),
    totaux: z.object({
      lignes: z.int(),
      valides: z.int(),
      enErreur: z.int(),
      avecAvertissement: z.int(),
      /** Lignes dont l'email désigne déjà une fiche de l'école. */
      existantes: z.int(),
    }),
    /** Lignes en erreur ou avec avertissement d'abord, puis un échantillon des autres. */
    lignes: z.array(LigneApercu),
    expireLe: z.iso.datetime({ offset: true }),
    /** Bilan d'un import validé (RG-01-20) ; null en préparation. */
    bilan: z
      .object({
        crees: z.int(),
        modifies: z.int(),
        rejetes: z.int(),
        valideLe: z.iso.datetime({ offset: true }),
        /** Annulable : moins de 24 h et aucune fiche utilisée depuis. */
        annulable: z.boolean(),
      })
      .nullable(),
  })
  .meta({ id: 'ApercuImport' });
export type ApercuImport = z.infer<typeof ApercuImport>;

export const NouvelImport = z
  .object({ type: z.enum(TYPES_IMPORT), fichier: z.string().trim().min(1).max(200) })
  .meta({ id: 'NouvelImport' });
export type NouvelImport = z.infer<typeof NouvelImport>;

export const ModificationCorrespondance = z
  .object({ correspondance: z.record(z.string(), champ.nullable()) })
  .meta({ id: 'ModificationCorrespondance' });
export type ModificationCorrespondance = z.infer<typeof ModificationCorrespondance>;

/** Étape 4 : tout ou rien, ou seulement les lignes valides (RG-01-19). */
export const ValidationImport = z
  .object({
    mode: z.enum(['tout', 'valides']).default('tout'),
    /** Lignes dont l'email désigne une fiche existante : la mettre à jour, ou ignorer la ligne. */
    existants: z.enum(['mettre-a-jour', 'ignorer']).default('ignorer'),
  })
  .meta({ id: 'ValidationImport' });
export type ValidationImport = z.infer<typeof ValidationImport>;
