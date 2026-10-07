import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';
import { personne } from './personne.js';

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
