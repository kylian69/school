import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
/** RG-06-08 : mode de présence d'une séance, choisi dans l'emploi du temps. */
export const seanceModePresence = pgEnum('seance_mode_presence', [
  'presentiel',
  'distanciel',
  'hybride',
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
    /**
     * Ancienne marque « à distance », tenue égale à mode_presence = 'distanciel' pour la version
     * précédente pendant une mise à jour ; à retirer dans la version suivante (ajouter, basculer,
     * retirer). Ne plus la lire.
     */
    distanciel: boolean().notNull().default(false),
    /**
     * RG-06-08 : présentiel, à distance (sans contrôle de localisation) ou hybride (l'apprenant
     * déclare s'il suit à distance). Un lien de visio ne rend pas une séance hybride.
     */
    modePresence: seanceModePresence().notNull().default('presentiel'),
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
    /**
     * ADR 0006 : version de la clé maîtresse dont dérive la clé de séance (QR et code à 6 chiffres),
     * mémorisée à l'ouverture de l'appel ; le scan ne vérifie qu'avec elle. Null : appel jamais
     * ouvert depuis cette colonne (version courante).
     */
    emargementCleVersion: integer(),
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
      'seance_emargement_cle_version_check',
      sql`${t.emargementCleVersion} is null or ${t.emargementCleVersion} > 0`,
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
    /**
     * RG-06-08 : émargement à distance (séance à distance, ou hybride sur déclaration de
     * l'apprenant) ; la localisation n'est alors pas contrôlée.
     */
    aDistance: boolean().notNull().default(false),
    /** RG-06-02 : minutes de retard d'un scan tardif, calculées au scan ; null : à l'heure. */
    retardMinutes: smallint(),
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

/** US-06-04, RG-06-12 : décision de l'intervenant sur un attendu. */
export const presenceMarquageStatut = pgEnum('presence_marquage_statut', [
  'present',
  'retard',
  'absent',
]);

/**
 * Appel manuel (US-06-04, US-06-05) : décision de l'intervenant sur un attendu, une par séance et
 * par apprenant. Elle l'emporte sur le scan (table presence), conservé tel quel comme preuve ; chaque
 * changement est tracé dans le journal d'audit avec la valeur avant et après.
 */
export const presenceMarquage = pgTable(
  'presence_marquage',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    personneId: uuid().notNull(),
    statut: presenceMarquageStatut().notNull(),
    minutesRetard: smallint(),
    /** Fiche de l'intervenant (ou de la personne habilitée) qui a marqué. */
    marquePar: uuid().notNull(),
    marqueLe: timestamp({ withTimezone: true }).notNull(),
    /**
     * Apprenant non attendu à la séance (mauvais groupe), ajouté par l'intervenant : l'anomalie est
     * signalée à la scolarité (module 06, section 7).
     */
    nonAttendu: boolean().notNull().default(false),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('presence_marquage', t),
    uniqueIndex('presence_marquage_unique_key').on(t.organisationId, t.seanceId, t.personneId),
    foreignKey({
      name: 'presence_marquage_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'presence_marquage_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'presence_marquage_marque_par_fk',
      columns: [t.organisationId, t.marquePar],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check(
      'presence_marquage_retard_check',
      sql`(${t.statut} = 'retard') = (${t.minutesRetard} is not null and ${t.minutesRetard} > 0)`,
    ),
  ],
).enableRLS();

/** Ligne de la liste validée, telle que signée (packages/domain, LigneFeuille). */
export interface LigneAppelValidee {
  personneId: string;
  statut: 'present' | 'retard' | 'absent' | 'a-verifier' | 'en-attente';
  scanneLe: string | null;
  minutesRetard: number | null;
  aDistance: boolean;
  localisation: string | null;
  raison: 'rejoue' | 'hors-site' | 'inconnu' | null;
  decision: 'confirme' | 'retire' | null;
  nonAttendu: boolean;
}

/** RG-06-15 : correction après verrouillage, par le droit de l'école ou de l'intervenant. */
export const appelCorrectionVerrouillee = pgEnum('appel_correction_verrouillee', [
  'ecole',
  'intervenant',
]);

/**
 * Validation de l'appel (RG-06-13, signature électronique simple), une ligne par version : la
 * première validation, puis chaque correction (RG-06-15), avec son motif. Les versions ne sont
 * jamais modifiées ; l'ancienne reste consultable. La liste validée est gardée sans nom (les fiches
 * font foi), avec son empreinte SHA-256.
 */
export const appelValidation = pgTable(
  'appel_validation',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    version: smallint().notNull(),
    /** Fiche de la personne qui valide ou corrige. */
    validePar: uuid().notNull(),
    /** Heure du serveur, jamais celle de l'appareil. */
    valideLe: timestamp({ withTimezone: true }).notNull(),
    adresseIp: text().notNull(),
    /** RG-06-13 et module 06, section 9 : empreinte de l'appareil, hachée (SHA-256 du User-Agent). */
    appareil: text().notNull(),
    empreinte: text().notNull(),
    liste: jsonb().$type<LigneAppelValidee[]>().notNull(),
    motif: text(),
    commentaire: text(),
    /** RG-06-15 : correction faite après le verrouillage, et de quel droit ; null sinon. */
    correctionVerrouillee: appelCorrectionVerrouillee(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('appel_validation', t),
    check(
      'appel_validation_correction_verrouillee_check',
      sql`${t.correctionVerrouillee} is null or ${t.version} > 1`,
    ),
    uniqueIndex('appel_validation_version_key').on(t.organisationId, t.seanceId, t.version),
    foreignKey({
      name: 'appel_validation_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'appel_validation_valide_par_fk',
      columns: [t.organisationId, t.validePar],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('appel_validation_motif_check', sql`(${t.version} = 1) = (${t.motif} is null)`),
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

/** RG-06-16, RG-06-17 : absence à toute la séance, ou retard (minutes manquées). */
export const absenceNature = pgEnum('absence_nature', ['absence', 'retard']);
/** RG-06-21 : statut de justification ; une absence naît non justifiée. */
export const absenceStatut = pgEnum('absence_statut', ['non-justifiee', 'justifiee']);

/**
 * Retard ou absence d'un apprenant à une séance (I4.4 ; RG-06-16 à RG-06-18), calculé à chaque
 * version validée de l'appel (packages/domain, absencesDeLAppel), jamais sur le chemin du scan. La
 * feuille signée fait foi ; cette table la complète des demi-journées (limite matin / après-midi de
 * l'établissement, RG-04-02) et du statut de justification, couche ajoutée (RG-06-21).
 */
export const absence = pgTable(
  'absence',
  {
    ...organisationScoped(),
    seanceId: uuid().notNull(),
    personneId: uuid().notNull(),
    nature: absenceNature().notNull(),
    statut: absenceStatut().notNull().default('non-justifiee'),
    /** Durée manquée : la séance entière, ou les minutes de retard. */
    minutes: integer().notNull(),
    /** Jour de la séance dans le fuseau de l'établissement, et demi-journées touchées. */
    jour: date().notNull(),
    matin: boolean().notNull(),
    apresMidi: boolean().notNull(),
    /** Version de l'appel validé dont l'absence est issue (RG-06-13). */
    versionAppel: smallint().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('absence', t),
    uniqueIndex('absence_seance_personne_key').on(t.organisationId, t.seanceId, t.personneId),
    /** « Mes absences » et décompte d'un apprenant sur une période. */
    index('absence_personne_jour_idx').on(t.organisationId, t.personneId, t.jour),
    /** Suivi de la scolarité sur une période. */
    index('absence_jour_idx').on(t.organisationId, t.jour),
    foreignKey({
      name: 'absence_seance_fk',
      columns: [t.organisationId, t.seanceId],
      foreignColumns: [seance.organisationId, seance.id],
    }),
    foreignKey({
      name: 'absence_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('absence_minutes_check', sql`${t.minutes} > 0`),
    check('absence_demi_journee_check', sql`${t.matin} or ${t.apresMidi}`),
  ],
).enableRLS();

/** RG-06-19 : motif choisi dans la liste par défaut de l'école (aucun détail médical, RG-06-20). */
export const justificatifMotif = pgEnum('justificatif_motif', [
  'maladie',
  'rendez-vous-medical',
  'transport',
  'convocation',
  'evenement-familial',
  'raison-professionnelle',
  'autre',
]);
/** RG-06-21 : à traiter ⇄ complément demandé → accepté ou refusé. */
export const justificatifStatut = pgEnum('justificatif_statut', [
  'a-traiter',
  'complement-demande',
  'accepte',
  'refuse',
]);

/**
 * Justificatif d'absence (I4.4 ; RG-06-19 à RG-06-21) déposé par l'apprenant, ou par la scolarité
 * pour lui, pour un ou plusieurs retards et absences. Données de santé possibles (RG-06-20) : le
 * document reste dans le stockage privé (clé seule ici), la précision libre de l'apprenant et le
 * message de la scolarité sont chiffrés par champ ; ni l'un ni l'autre ne va au journal d'audit.
 */
export const justificatif = pgTable(
  'justificatif',
  {
    ...organisationScoped(),
    /** Apprenant concerné. */
    personneId: uuid().notNull(),
    motif: justificatifMotif().notNull(),
    /** Précision facultative de l'apprenant, chiffrée (contexte : identifiant de la ligne). */
    precisionChiffre: text(),
    /** Photo ou PDF dans le stockage privé ; null tant qu'il n'est pas joint. */
    documentCle: text(),
    documentType: text(),
    documentTaille: integer(),
    documentSha256: text(),
    deposeLe: timestamp({ withTimezone: true }).notNull(),
    /** Fiche de la personne qui a déposé : l'apprenant, ou la scolarité pour lui. */
    deposePar: uuid().notNull(),
    /** RG-06-19 : déposé après le délai de l'école (signalé, jamais bloquant). */
    horsDelai: boolean().notNull(),
    statut: justificatifStatut().notNull().default('a-traiter'),
    /** Motif du refus ou complément demandé, chiffré ; montré à l'apprenant. */
    messageChiffre: text(),
    decideLe: timestamp({ withTimezone: true }),
    decidePar: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('justificatif', t),
    /** File de traitement : les justificatifs d'un statut, les plus anciens d'abord. */
    index('justificatif_statut_idx').on(t.organisationId, t.statut, t.deposeLe),
    /** Justificatifs d'un apprenant (« Mes absences »). */
    index('justificatif_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'justificatif_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'justificatif_depose_par_fk',
      columns: [t.organisationId, t.deposePar],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check(
      'justificatif_document_check',
      sql`(${t.documentCle} is null) = (${t.documentType} is null)`,
    ),
    check(
      'justificatif_decision_check',
      sql`(${t.statut} in ('accepte', 'refuse')) = (${t.decideLe} is not null)`,
    ),
  ],
).enableRLS();

/**
 * Retards et absences couverts par un justificatif. Une absence retirée par la correction de
 * l'appel quitte le justificatif (suppression en cascade).
 */
export const justificatifAbsence = pgTable(
  'justificatif_absence',
  {
    ...organisationScoped(),
    justificatifId: uuid().notNull(),
    absenceId: uuid().notNull(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('justificatif_absence', t),
    uniqueIndex('justificatif_absence_key').on(t.organisationId, t.justificatifId, t.absenceId),
    /** Justificatifs d'une absence (un seul ouvert ou accepté à la fois). */
    index('justificatif_absence_absence_idx').on(t.organisationId, t.absenceId),
    foreignKey({
      name: 'justificatif_absence_justificatif_fk',
      columns: [t.organisationId, t.justificatifId],
      foreignColumns: [justificatif.organisationId, justificatif.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'justificatif_absence_absence_fk',
      columns: [t.organisationId, t.absenceId],
      foreignColumns: [absence.organisationId, absence.id],
    }).onDelete('cascade'),
  ],
).enableRLS();

/** RG-06-23 : une alerte reste « ouverte » jusqu'à ce que la scolarité ou la pédagogie la traite. */
export const alerteAssiduiteStatut = pgEnum('alerte_assiduite_statut', ['ouverte', 'traitee']);

/**
 * Alerte d'assiduité (I4.4 ; RG-06-23, RG-03-20) : un apprenant a atteint un niveau de seuil de
 * demi-journées non justifiées sur la période glissante. Créée par le worker au plus une fois par
 * niveau et par période (domaine, alertesADeclencher) ; `notifieeLe` marque l'email envoyé à la
 * scolarité, à la pédagogie (niveau 1) et à la direction (niveau 2). Les seuils sont recopiés :
 * l'alerte reste lisible si l'école les change ensuite.
 */
export const alerteAssiduite = pgTable(
  'alerte_assiduite',
  {
    ...organisationScoped(),
    personneId: uuid().notNull(),
    niveau: smallint().notNull(),
    declencheeLe: timestamp({ withTimezone: true }).notNull(),
    /** Demi-journées non justifiées constatées, seuil franchi et période, au déclenchement. */
    demiJournees: smallint().notNull(),
    seuil: smallint().notNull(),
    fenetreJours: smallint().notNull(),
    notifieeLe: timestamp({ withTimezone: true }),
    statut: alerteAssiduiteStatut().notNull().default('ouverte'),
    traiteeLe: timestamp({ withTimezone: true }),
    traiteePar: uuid(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('alerte_assiduite', t),
    /** Dernières alertes d'un apprenant par niveau (anti-rafale). */
    index('alerte_assiduite_personne_idx').on(
      t.organisationId,
      t.personneId,
      t.niveau,
      t.declencheeLe,
    ),
    /** Alertes ouvertes, et alertes à notifier. */
    index('alerte_assiduite_statut_idx').on(t.organisationId, t.statut, t.declencheeLe),
    foreignKey({
      name: 'alerte_assiduite_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('alerte_assiduite_niveau_check', sql`${t.niveau} in (1, 2)`),
    check(
      'alerte_assiduite_traitement_check',
      sql`(${t.statut} = 'traitee') = (${t.traiteeLe} is not null)`,
    ),
  ],
).enableRLS();
