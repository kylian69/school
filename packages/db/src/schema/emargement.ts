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
    /** RG-04-11 : identifiant dans l'outil d'origine (colonne dédiée, UID iCal ou calculé). */
    identifiantExterne: text(),
    /** RG-04-12 : empreinte du contenu au dernier import ; différente : modifiée dans Scolaly. */
    empreinteImport: text(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('seance', t),
    index('seance_organisation_id_debut_idx').on(t.organisationId, t.debut),
    index('seance_serie_idx').on(t.organisationId, t.serieId),
    uniqueIndex('seance_identifiant_externe_key')
      .on(t.organisationId, t.identifiantExterne)
      .where(sql`${t.identifiantExterne} is not null and ${t.deletedAt} is null`),
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

/** RG-04-09 : nature d'un libellé d'import d'EDT. */
export const correspondanceEdtNature = pgEnum('correspondance_edt_nature', [
  'module',
  'public',
  'salle',
  'intervenant',
]);

/**
 * RG-04-09 : correspondance mémorisée entre un libellé d'un fichier importé et un objet de
 * Scolaly (module, promotion ou groupe, salle, intervenant). Sans objet : activité hors maquette
 * pour un module, séance sans salle ou sans intervenant (module 04, section 7).
 */
export const correspondanceEdt = pgTable(
  'correspondance_edt',
  {
    ...organisationScoped(),
    nature: correspondanceEdtNature().notNull(),
    /** Libellé tel qu'il figure dans le fichier. */
    libelle: text().notNull(),
    /** Forme comparable du libellé (sans accents ni casse). */
    cle: text().notNull(),
    objetId: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('correspondance_edt', t),
    uniqueIndex('correspondance_edt_cle_key')
      .on(t.organisationId, t.nature, t.cle)
      .where(sql`${t.deletedAt} is null`),
  ],
).enableRLS();

export const notificationEdtNature = pgEnum('notification_edt_nature', [
  'publication',
  'modification',
  'annulation',
  'report',
  'retrait',
]);

/**
 * RG-04-14 : changement d'une séance à signaler à une personne concernée (apprenant attendu ou
 * intervenant). Une ligne par événement, personne et séance : le traitement d'un événement rejoué
 * ne crée pas de doublon. Les lignes d'une personne partent en un seul email (immédiat si urgente,
 * sinon au récapitulatif quotidien), puis sont supprimées : rien n'est conservé après l'envoi.
 */
export const notificationEdt = pgTable(
  'notification_edt',
  {
    ...organisationScoped(),
    /** Événement de la boîte d'envoi d'origine. */
    evenementId: uuid().notNull(),
    personneId: uuid().notNull(),
    seanceId: uuid().notNull(),
    nature: notificationEdtNature().notNull(),
    /** RG-04-14 : la séance a lieu dans les 48 heures, envoi immédiat. */
    urgente: boolean().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('notification_edt', t),
    uniqueIndex('notification_edt_evenement_key').on(
      t.organisationId,
      t.evenementId,
      t.personneId,
      t.seanceId,
    ),
    index('notification_edt_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'notification_edt_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'notification_edt_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
  ],
).enableRLS();

export const presenceMode = pgEnum('presence_mode', ['qr', 'code', 'manuel']);
/** RG-06-10, RGPD-03 : seul résultat conservé du contrôle de localisation (jamais la position). */
export const presenceLocalisation = pgEnum('presence_localisation', [
  'sur-place',
  'hors-site',
  'inconnu',
]);

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
    /**
     * RG-06-09 : résultat du contrôle de localisation ; null sans contrôle. Hors site ou inconnu :
     * présence à vérifier par l'intervenant. Effacé à l'échéance (packages/referentials,
     * `presence-localisation`).
     */
    localisation: presenceLocalisation(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('presence', t),
    uniqueIndex('presence_unique_key').on(t.organisationId, t.seanceId, t.personneId),
    /** Effacement des résultats échus (RGPD-03) : index restreint aux résultats encore présents. */
    index('presence_localisation_idx')
      .on(t.organisationId, t.scanneLe)
      .where(sql`${t.localisation} is not null`),
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

/** Intervenants d'une séance (RG-04-01), un ou plusieurs (remplace l'ancienne colonne seance.intervenant_id). */
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
 * n'a rien déclaré. Période de validité facultative (dates comprises) : hors d'elle, le créneau ne
 * s'applique pas.
 */
export const disponibiliteIntervenant = pgTable(
  'disponibilite_intervenant',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    jourSemaine: smallint().notNull(),
    heureDebut: time().notNull(),
    heureFin: time().notNull(),
    valableDu: date(),
    valableAu: date(),
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
    check(
      'disponibilite_intervenant_validite_check',
      sql`${t.valableDu} is null or ${t.valableAu} is null or ${t.valableAu} >= ${t.valableDu}`,
    ),
  ],
).enableRLS();

/**
 * RG-04-18 : indisponibilité ponctuelle d'un intervenant. Le motif, facultatif, est une donnée
 * personnelle : chiffré par champ (contexte `indisponibilite_intervenant.motif`), lu par
 * l'intervenant et par les gestionnaires de son périmètre (`edt:gerer`), jamais dans les journaux.
 * Conservation (packages/referentials) : motif effacé à la fin, ligne supprimée ensuite.
 */
export const indisponibiliteIntervenant = pgTable(
  'indisponibilite_intervenant',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    debut: timestamp({ withTimezone: true }).notNull(),
    fin: timestamp({ withTimezone: true }).notNull(),
    motifChiffre: text(),
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
 * RG-04-15 : flux iCal personnel (adresse secrète, régénérable). Une ligne par personne. La lecture
 * publique cherche par l'empreinte SHA-256 du secret ; le jeton complet n'est conservé que chiffré
 * par champ (`jeton_chiffre`, contexte `flux_ical.jeton`) pour être réaffiché à son seul
 * propriétaire. Sans empreinte : flux révoqué. Empreinte sans jeton chiffré : flux créé avant la
 * migration 0055, à régénérer une fois pour réafficher l'adresse.
 */
export const fluxIcal = pgTable(
  'flux_ical',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    jetonEmpreinte: text(),
    jetonChiffre: text(),
    regenereLe: timestamp({ withTimezone: true }),
    revoqueLe: timestamp({ withTimezone: true }),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('flux_ical', t),
    uniqueIndex('flux_ical_personne_key').on(t.organisationId, t.personneId),
    uniqueIndex('flux_ical_jeton_empreinte_key')
      .on(t.organisationId, t.jetonEmpreinte)
      .where(sql`${t.jetonEmpreinte} is not null`),
    foreignKey({
      name: 'flux_ical_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

/**
 * Apprenants attendus à une séance, calculés (migration 0035, security_invoker : la RLS des tables
 * s'applique ; recréée sans l'ancienne table seance_attendu en 0058). Inscrits actifs le jour de la
 * séance, de la promotion visée ou membres du groupe visé ce jour-là.
 */
export const seanceAttenduCalcule = pgView('seance_attendu_calcule', {
  organisationId: uuid().notNull(),
  seanceId: uuid().notNull(),
  personneId: uuid().notNull(),
}).existing();
