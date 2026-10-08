import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  pgView,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';
import { maquetteModule } from './referentiel.js';
import { groupeEleves, promotion, salle } from './scolarite.js';
import { etablissement } from './structure.js';

/**
 * Série de séances récurrentes (US-04-02, RG-04-03) : la règle d'où ses séances ont été calculées
 * (packages/domain, occurrencesSerie). Les séances restent indépendantes une fois créées. Les heures
 * sont locales, dans le fuseau de l'établissement.
 */
export const seanceSerie = pgTable(
  'seance_serie',
  {
    ...organisationScoped(),
    etablissementId: uuid().notNull(),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
    /** Jours de la semaine, de 1 (lundi) à 7 (dimanche). */
    joursSemaine: smallint().array().notNull(),
    intervalleSemaines: smallint().notNull().default(1),
    heureDebut: time().notNull(),
    heureFin: time().notNull(),
    sauterJoursEntreprise: boolean().notNull().default(false),
    joursExclus: date()
      .array()
      .notNull()
      .default(sql`'{}'::date[]`),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance_serie', t),
    index('seance_serie_etablissement_idx').on(t.organisationId, t.etablissementId),
    foreignKey({
      name: 'seance_serie_etablissement_fk',
      columns: [t.organisationId, t.etablissementId],
      foreignColumns: [etablissement.organisationId, etablissement.id],
    }),
    check(
      'seance_serie_regle_check',
      sql`${t.dateFin} >= ${t.dateDebut} and ${t.heureFin} > ${t.heureDebut} and ${t.intervalleSemaines} >= 1 and cardinality(${t.joursSemaine}) > 0`,
    ),
  ],
).enableRLS();

/** RG-04-01 : statut d'une séance ; les séances créées avant I4.1 sont publiées. */
export const seanceStatut = pgEnum('seance_statut', [
  'brouillon',
  'publiee',
  'annulee',
  'reportee',
]);
/** RG-04-01 : type d'une séance. */
export const seanceType = pgEnum('seance_type', ['cm', 'td', 'tp', 'projet', 'examen']);

/**
 * Séance (P2, complétée en I4.1, RG-04-01) : module ou activité hors maquette, type, statut, salle
 * ou lien de visio, série éventuelle. Son public est dans seance_public.
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
    /**
     * Obsolète : remplacée par seance_intervenant (RG-04-01). Écrite (premier intervenant) pour les
     * versions précédentes pendant la bascule ; à retirer dans une version suivante.
     */
    intervenantId: uuid(),
    statut: seanceStatut().notNull().default('publiee'),
    type: seanceType(),
    moduleId: uuid(),
    /** Activité hors maquette (réunion, accueil, rattrapage) quand il n'y a pas de module. */
    activite: text(),
    salleId: uuid(),
    lienVisio: text(),
    /** Motif de l'annulation ou du report (RG-04-04, US-04-11). */
    motifAnnulation: text(),
    serieId: uuid(),
    /** US-04-11 : séance de remplacement d'une séance reportée. */
    reporteeVersId: uuid(),
    /**
     * RG-04-14 : dernière modification significative d'une séance publiée (horaire, salle,
     * intervenant, annulation, report), pour les notifications et le badge « modifié ».
     */
    modifieeLe: timestamp({ withTimezone: true }),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance', t),
    index('seance_organisation_id_debut_idx').on(t.organisationId, t.debut),
    index('seance_serie_idx').on(t.organisationId, t.serieId),
    foreignKey({
      name: 'seance_intervenant_fk',
      columns: [t.organisationId, t.intervenantId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'seance_module_fk',
      columns: [t.organisationId, t.moduleId],
      foreignColumns: [maquetteModule.organisationId, maquetteModule.id],
    }),
    foreignKey({
      name: 'seance_salle_fk',
      columns: [t.organisationId, t.salleId],
      foreignColumns: [salle.organisationId, salle.id],
    }),
    foreignKey({
      name: 'seance_serie_fk',
      columns: [t.organisationId, t.serieId],
      foreignColumns: [seanceSerie.organisationId, seanceSerie.id],
    }),
    foreignKey({
      name: 'seance_reportee_vers_fk',
      columns: [t.organisationId, t.reporteeVersId],
      foreignColumns: [t.organisationId, t.id],
    }),
    check('seance_dates_check', sql`${t.fin} > ${t.debut}`),
    check(
      'seance_report_check',
      sql`${t.statut} <> 'reportee' or (${t.reporteeVersId} is not null and ${t.motifAnnulation} is not null)`,
    ),
    check(
      'seance_annulation_check',
      sql`${t.statut} <> 'annulee' or ${t.motifAnnulation} is not null`,
    ),
  ],
).enableRLS();

/** RG-04-06 : seuls les conflits de salle et de groupe (cours commun) peuvent être forcés. */
export const seanceForcageCode = pgEnum('seance_forcage_code', ['salle-occupee', 'groupe-occupe']);

/**
 * Conflit bloquant forcé par un responsable (RG-04-06), avec son motif : la séance peut être
 * publiée malgré son conflit avec l'autre séance. Le forçage est aussi tracé dans le journal.
 */
export const seanceForcage = pgTable(
  'seance_forcage',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    code: seanceForcageCode().notNull(),
    /** Séance avec laquelle le conflit est accepté. */
    autreSeanceId: uuid().notNull(),
    motif: text().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance_forcage', t),
    uniqueIndex('seance_forcage_conflit_key')
      .on(t.organisationId, t.seanceId, t.code, t.autreSeanceId)
      .where(sql`${t.deletedAt} is null`),
    foreignKey({
      name: 'seance_forcage_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'seance_forcage_autre_seance_fk',
      columns: [t.organisationId, t.autreSeanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
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
 * Intervenants d'une séance (RG-04-01), un ou plusieurs. Remplace la colonne seance.intervenant_id,
 * encore écrite (premier intervenant) pendant la bascule puis retirée (« ajouter, basculer, retirer »).
 */
export const seanceIntervenant = pgTable(
  'seance_intervenant',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    personneId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance_intervenant', t),
    uniqueIndex('seance_intervenant_paire_key')
      .on(t.organisationId, t.seanceId, t.personneId)
      .where(sql`${t.deletedAt} is null`),
    /** Séances d'un intervenant (US-06-01, vue par intervenant de l'emploi du temps). */
    index('seance_intervenant_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'seance_intervenant_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'seance_intervenant_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

/**
 * RG-04-18 : créneau récurrent où un intervenant se déclare disponible (jour 1, lundi, à 7,
 * dimanche ; heures dans le fuseau de l'établissement de la séance). Sans créneau, l'intervenant
 * n'a rien déclaré.
 */
export const disponibiliteIntervenant = pgTable(
  'disponibilite_intervenant',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    jourSemaine: smallint().notNull(),
    heureDebut: time().notNull(),
    heureFin: time().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('disponibilite_intervenant', t),
    index('disponibilite_intervenant_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'disponibilite_intervenant_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check(
      'disponibilite_intervenant_creneau_check',
      sql`${t.jourSemaine} between 1 and 7 and ${t.heureFin} > ${t.heureDebut}`,
    ),
  ],
).enableRLS();

/** RG-04-18 : indisponibilité ponctuelle d'un intervenant, sans motif (minimisation). */
export const indisponibiliteIntervenant = pgTable(
  'indisponibilite_intervenant',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    debut: timestamp({ withTimezone: true }).notNull(),
    fin: timestamp({ withTimezone: true }).notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('indisponibilite_intervenant', t),
    index('indisponibilite_intervenant_personne_idx').on(t.organisationId, t.personneId, t.debut),
    foreignKey({
      name: 'indisponibilite_intervenant_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('indisponibilite_intervenant_dates_check', sql`${t.fin} > ${t.debut}`),
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
