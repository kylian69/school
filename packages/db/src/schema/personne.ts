import { sql } from 'drizzle-orm';
import {
  char,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUser } from './auth.js';
import { trackingColumns } from './columns.js';
import { organisationConstraints, organisationScoped } from './organisation.js';

/**
 * Personne (module 01, section 6), chaque attribut justifié par sa story (minimisation, RGPD).
 * La date et le lieu de naissance ne sont montrés qu'à la scolarité et à l'administration
 * (module 01, section 9).
 */
export const compteEtat = pgEnum('compte_etat', ['cree', 'invite', 'actif', 'desactive']);

export const civilite = pgEnum('civilite', ['madame', 'monsieur']);

export const photoStatut = pgEnum('photo_statut', ['en_attente', 'validee', 'refusee']);

export const personne = pgTable(
  'personne',
  {
    ...organisationScoped(),
    nom: text().notNull(),
    nomUsage: text(),
    prenom: text().notNull(),
    email: text().notNull(),
    /** Identité (US-01-02 du module 01, fiche personne E-01-05). */
    civilite: civilite(),
    dateNaissance: date(),
    lieuNaissance: text(),
    /** RG-01-06 : unique dans l'école et jamais réattribué, même après suppression. */
    matricule: text(),
    /** Identifiant national élève ou étudiant (11 caractères). */
    ine: char({ length: 11 }),
    /**
     * Photo (RG-01-26, RG-01-27) : la photo validée, celle qui attend la validation de la
     * scolarité, et le statut et le motif de la dernière photo déposée par la personne.
     */
    photoCle: text(),
    photoAttenteCle: text(),
    photoStatut: photoStatut(),
    photoMotif: text(),
    telephone: text(),
    adresseLigne1: text(),
    codePostal: text(),
    ville: text(),
    /**
     * Compte de connexion (RG-00-26 : un seul compte pour les fiches d'une même personne dans les
     * écoles d'un groupe). Null tant que la personne n'a pas activé son compte.
     */
    userId: uuid().references(() => authUser.id),
    /** Cycle de vie du compte dans cette école (RG-01-08). */
    compteEtat: compteEtat().notNull().default('cree'),
    /** Acceptation des conditions d'utilisation à l'activation (parcours d'activation). */
    conditionsAccepteesLe: timestamp({ withTimezone: true }),
    ...trackingColumns(),
  },
  (t) => [
    ...organisationConstraints('personne', t),
    // RG-01-06 : une personne est identifiée de façon unique par son email dans l'organisation.
    uniqueIndex('personne_organisation_id_email_key')
      .on(t.organisationId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null`),
    // Liste des personnes triée par nom (E-01-04 : pagination côté serveur).
    index('personne_organisation_id_nom_prenom_idx').on(
      t.organisationId,
      sql`lower(${t.nom})`,
      sql`lower(${t.prenom})`,
    ),
    uniqueIndex('personne_organisation_id_matricule_key')
      .on(t.organisationId, t.matricule)
      .where(sql`${t.matricule} is not null`),
    uniqueIndex('personne_organisation_id_ine_key')
      .on(t.organisationId, t.ine)
      .where(sql`${t.ine} is not null and ${t.deletedAt} is null`),
    uniqueIndex('personne_organisation_id_user_id_key')
      .on(t.organisationId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
).enableRLS();
