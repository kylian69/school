import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';

export const typeImport = pgEnum('type_import', ['apprenants', 'intervenants', 'personnel']);
export const statutImport = pgEnum('statut_import', ['en_preparation', 'valide', 'annule']);

/**
 * Import de personnes (US-01-05 ; RG-01-18 à RG-01-20) : fichier conservé 24 h pour reprendre,
 * correspondance des colonnes (reprise pour l'import suivant), puis bilan et ce qu'il faut pour
 * annuler l'import dans les 24 h.
 */
export const importPersonnes = pgTable(
  'import_personnes',
  {
    ...organisationScoped(),
    type: typeImport().notNull(),
    statut: statutImport().notNull().default('en_preparation'),
    fichierCle: text().notNull(),
    fichierNom: text().notNull(),
    fichierType: text().notNull(),
    colonnes: jsonb().$type<string[]>().notNull(),
    correspondance: jsonb().$type<Record<string, string | null>>().notNull(),
    lignes: integer().notNull(),
    /** Fin de la reprise possible d'un import en préparation (fichier conservé 24 h). */
    expireLe: timestamp({ withTimezone: true }).notNull(),
    valideLe: timestamp({ withTimezone: true }),
    annuleLe: timestamp({ withTimezone: true }),
    crees: integer(),
    modifies: integer(),
    rejetes: integer(),
    /** Fiches créées et valeurs avant modification, pour l'annulation (RG-01-20). */
    resultat: jsonb(),
    /** Lignes rejetées et leurs motifs, pour le rapport téléchargeable (RG-01-19). */
    rapport: jsonb(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('import_personnes', t),
    index('import_personnes_organisation_id_created_at_idx').on(t.organisationId, t.createdAt),
  ],
).enableRLS();
