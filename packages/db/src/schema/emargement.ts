import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  pgView,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';
import { groupeEleves, promotion } from './scolarite.js';

/**
 * Séance (P2, version minimale) : ce qu'il faut pour émarger. L'emploi du temps (I4.1) la complétera
 * par ajout de colonnes (salle, groupes, module, récurrence, publication).
 */
export const seance = pgTable(
  'seance',
  {
    ...organisationScoped(),
    libelle: text().notNull(),
    debut: timestamp({ withTimezone: true }).notNull(),
    fin: timestamp({ withTimezone: true }).notNull(),
    /** RG-06-08 : séance à distance, sans contrôle de localisation. */
    distanciel: boolean().notNull().default(false),
    intervenantId: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance', t),
    index('seance_organisation_id_debut_idx').on(t.organisationId, t.debut),
    foreignKey({
      name: 'seance_intervenant_fk',
      columns: [t.organisationId, t.intervenantId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('seance_dates_check', sql`${t.fin} > ${t.debut}`),
  ],
).enableRLS();

/**
 * Apprenants attendus à une séance, saisis un à un (P2). Remplacée en I3.2 par le public de la
 * séance (seance_public) : plus aucune écriture ; la vue seance_attendu_calcule la lit encore
 * pendant la bascule, puis la table sera retirée (« ajouter, basculer, retirer »).
 */
export const seanceAttendu = pgTable(
  'seance_attendu',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    personneId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance_attendu', t),
    uniqueIndex('seance_attendu_paire_key').on(t.organisationId, t.seanceId, t.personneId),
    foreignKey({
      name: 'seance_attendu_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'seance_attendu_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

export const presenceMode = pgEnum('presence_mode', ['qr', 'code', 'manuel']);

/**
 * Présence enregistrée (RG-00-18) : une seule par apprenant et par séance. Écrite par lots depuis
 * le flux Valkey ; l'heure est celle du scan, pas celle de l'écriture.
 */
export const presence = pgTable(
  'presence',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    personneId: uuid().notNull(),
    scanneLe: timestamp({ withTimezone: true }).notNull(),
    mode: presenceMode().notNull(),
    /** RG-00-19 : scan conservé hors ligne puis renvoyé, à vérifier par l'intervenant. */
    rejoue: boolean().notNull().default(false),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('presence', t),
    uniqueIndex('presence_unique_key').on(t.organisationId, t.seanceId, t.personneId),
    foreignKey({
      name: 'presence_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'presence_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

/**
 * Public d'une séance (RG-06-04, I3.2) : une promotion entière, ou un groupe. Les apprenants
 * attendus en découlent, le jour de la séance (inscriptions et appartenances aux groupes datées).
 */
export const seancePublic = pgTable(
  'seance_public',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    promotionId: uuid(),
    groupeId: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance_public', t),
    index('seance_public_seance_idx').on(t.organisationId, t.seanceId),
    foreignKey({
      name: 'seance_public_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'seance_public_promotion_fk',
      columns: [t.organisationId, t.promotionId],
      foreignColumns: [promotion.organisationId, promotion.id],
    }),
    foreignKey({
      name: 'seance_public_groupe_fk',
      columns: [t.organisationId, t.groupeId],
      foreignColumns: [groupeEleves.organisationId, groupeEleves.id],
    }),
    check('seance_public_cible_check', sql`(${t.promotionId} is null) <> (${t.groupeId} is null)`),
  ],
).enableRLS();

/**
 * Apprenants attendus à une séance, calculés (migration 0035, security_invoker : la RLS des tables
 * s'applique). Inscrits actifs le jour de la séance, de la promotion visée ou membres du groupe
 * visé ce jour-là, plus les lignes historiques de seance_attendu tant qu'elle existe.
 */
export const seanceAttenduCalcule = pgView('seance_attendu_calcule', {
  organisationId: uuid().notNull(),
  seanceId: uuid().notNull(),
  personneId: uuid().notNull(),
}).existing();
