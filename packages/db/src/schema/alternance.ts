import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';
import { inscription } from './scolarite.js';

/**
 * Alternance et stages (module 03, section 6) : entreprises, contacts et tuteurs. Les contrats,
 * conventions de stage et rythmes complètent ce schéma.
 */
export const entrepriseStatut = pgEnum('entreprise_statut', ['active', 'fermee']);

/** Entreprise : établissement employeur ou organisme d'accueil, identifié par son SIRET (RG-03-01). */
export const entreprise = pgTable(
  'entreprise',
  {
    ...organisationScoped(),
    siret: char({ length: 14 }).notNull(),
    siren: char({ length: 9 }).notNull(),
    raisonSociale: text().notNull(),
    adresse: text(),
    codePostal: text(),
    ville: text(),
    naf: text(),
    effectif: text(),
    /** RG-03-02 : convention collective et OPCO (proposé d'après l'IDCC, modifiable). */
    idcc: char({ length: 4 }),
    opco: text(),
    statut: entrepriseStatut().notNull().default('active'),
    /** Section 7 : saisie manuelle faute d'annuaire ; la vérification sera relancée. */
    aVerifier: boolean().notNull().default(false),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('entreprise', t),
    uniqueIndex('entreprise_siret_key')
      .on(t.organisationId, t.siret)
      .where(sql`${t.deletedAt} is null`),
    index('entreprise_siren_idx').on(t.organisationId, t.siren),
  ],
).enableRLS();

export const contactType = pgEnum('contact_entreprise_type', [
  'rh',
  'dirigeant',
  'tuteur',
  'autre',
]);

/** Contact d'une entreprise (RG-03-03) : une personne du module 01, sa fonction et son ancienneté. */
export const contactEntreprise = pgTable(
  'contact_entreprise',
  {
    ...organisationScoped(),
    entrepriseId: uuid().notNull(),
    personneId: uuid().notNull(),
    type: contactType().notNull(),
    fonction: text(),
    /** Date d'entrée dans l'entreprise (ancienneté du tuteur, exigée par le CERFA en V2). */
    dansEntrepriseDepuis: date(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('contact_entreprise', t),
    uniqueIndex('contact_entreprise_paire_key')
      .on(t.organisationId, t.entrepriseId, t.personneId)
      .where(sql`${t.deletedAt} is null`),
    index('contact_entreprise_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'contact_entreprise_entreprise_fk',
      columns: [t.organisationId, t.entrepriseId],
      foreignColumns: [entreprise.organisationId, entreprise.id],
    }),
    foreignKey({
      name: 'contact_entreprise_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

export const contratType = pgEnum('contrat_alternance_type', [
  'apprentissage',
  'professionnalisation',
  'autre',
]);
export const contratStatut = pgEnum('contrat_alternance_statut', [
  'brouillon',
  'signe',
  'en_cours',
  'termine',
  'rompu',
]);
export const motifRupture = pgEnum('motif_rupture', [
  'periode_essai',
  'accord_commun',
  'demission',
  'licenciement',
  'autre',
]);

/** Contrat d'alternance, fiche simplifiée du MVP (RG-03-05 à RG-03-09). */
export const contratAlternance = pgTable(
  'contrat_alternance',
  {
    ...organisationScoped(),
    /** L'inscription de l'apprenant, dont le statut suit le contrat (RG-03-06). */
    inscriptionId: uuid().notNull(),
    personneId: uuid().notNull(),
    entrepriseId: uuid().notNull(),
    type: contratType().notNull(),
    debut: date().notNull(),
    fin: date().notNull(),
    opco: text(),
    numeroDepot: text(),
    statut: contratStatut().notNull().default('brouillon'),
    /** Référent école de l'alternant (module 03, section 2). */
    referentId: uuid(),
    /** RG-03-04 : formation prolongée (compte à part pour le maître d'apprentissage). */
    formationProlongee: boolean().notNull().default(false),
    dateRupture: date(),
    motifRupture: motifRupture(),
    /** RG-03-07 : fin de la poursuite de formation sans employeur, si l'apprenti la choisit. */
    sansEmployeurJusquau: date(),
    documentCle: text(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('contrat_alternance', t),
    index('contrat_alternance_personne_idx').on(t.organisationId, t.personneId),
    index('contrat_alternance_entreprise_idx').on(t.organisationId, t.entrepriseId),
    foreignKey({
      name: 'contrat_alternance_inscription_fk',
      columns: [t.organisationId, t.inscriptionId],
      foreignColumns: [inscription.organisationId, inscription.id],
    }),
    foreignKey({
      name: 'contrat_alternance_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'contrat_alternance_entreprise_fk',
      columns: [t.organisationId, t.entrepriseId],
      foreignColumns: [entreprise.organisationId, entreprise.id],
    }),
    foreignKey({
      name: 'contrat_alternance_referent_fk',
      columns: [t.organisationId, t.referentId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('contrat_alternance_dates_check', sql`${t.fin} >= ${t.debut}`),
  ],
).enableRLS();

/** Tuteurs d'un contrat, avec leur période (section 7 : changement de tuteur à une date d'effet). */
export const contratTuteur = pgTable(
  'contrat_tuteur',
  {
    ...organisationScoped(),
    contratId: uuid().notNull(),
    personneId: uuid().notNull(),
    debut: date().notNull(),
    /** Fin exclue : l'ancien tuteur perd l'accès ce jour-là. */
    fin: date(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('contrat_tuteur', t),
    index('contrat_tuteur_contrat_idx').on(t.organisationId, t.contratId),
    index('contrat_tuteur_personne_idx').on(t.organisationId, t.personneId),
    foreignKey({
      name: 'contrat_tuteur_contrat_fk',
      columns: [t.organisationId, t.contratId],
      foreignColumns: [contratAlternance.organisationId, contratAlternance.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contrat_tuteur_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
  ],
).enableRLS();

export const conventionStatut = pgEnum('convention_statut', [
  'brouillon',
  'signee',
  'en_cours',
  'terminee',
  'annulee',
]);

/** Convention de stage d'un étudiant en formation initiale (RG-03-22 à RG-03-24). */
export const conventionStage = pgTable(
  'convention_stage',
  {
    ...organisationScoped(),
    inscriptionId: uuid().notNull(),
    personneId: uuid().notNull(),
    entrepriseId: uuid().notNull(),
    tuteurId: uuid(),
    /** Enseignant référent, obligatoire (RG-03-22). */
    referentId: uuid().notNull(),
    debut: date().notNull(),
    fin: date().notNull(),
    heuresPresence: numeric({ precision: 7, scale: 2, mode: 'number' }).notNull(),
    missions: text(),
    /** Gratification horaire en centimes ; null : pas de gratification. */
    gratificationHoraire: integer(),
    statut: conventionStatut().notNull().default('brouillon'),
    /** Section 7 : dérogation tracée à l'obligation de gratification. */
    derogationMotif: text(),
    documentCle: text(),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('convention_stage', t),
    index('convention_stage_personne_idx').on(t.organisationId, t.personneId),
    index('convention_stage_entreprise_idx').on(t.organisationId, t.entrepriseId),
    foreignKey({
      name: 'convention_stage_inscription_fk',
      columns: [t.organisationId, t.inscriptionId],
      foreignColumns: [inscription.organisationId, inscription.id],
    }),
    foreignKey({
      name: 'convention_stage_personne_fk',
      columns: [t.organisationId, t.personneId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'convention_stage_entreprise_fk',
      columns: [t.organisationId, t.entrepriseId],
      foreignColumns: [entreprise.organisationId, entreprise.id],
    }),
    foreignKey({
      name: 'convention_stage_tuteur_fk',
      columns: [t.organisationId, t.tuteurId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    foreignKey({
      name: 'convention_stage_referent_fk',
      columns: [t.organisationId, t.referentId],
      foreignColumns: [personne.organisationId, personne.id],
    }),
    check('convention_stage_dates_check', sql`${t.fin} >= ${t.debut}`),
    check(
      'convention_stage_valeurs_check',
      sql`${t.heuresPresence} > 0 and (${t.gratificationHoraire} is null or ${t.gratificationHoraire} >= 0)`,
    ),
  ],
).enableRLS();
