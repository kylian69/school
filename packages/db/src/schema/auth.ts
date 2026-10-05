import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './columns.js';

/**
 * Tables de Better Auth (comptes, sessions, identifiants, vérifications) : tables de plateforme
 * sans organisation_id (ADR 0002), utilisées uniquement par le module d'authentification.
 * Le lien entre un compte et une école passe par des tables cloisonnées (I1.2).
 */
const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const authUser = pgTable('auth_user', {
  id: primaryId(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  /** Double authentification activée (RG-00-13, RG-01-11). */
  twoFactorEnabled: boolean().notNull().default(false),
  image: text(),
  ...timestamps(),
});

export const authSession = pgTable(
  'auth_session',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    /** École choisie pour cette session (RG-01-29), vérifiée à chaque requête par l'API. */
    activeOrganisationId: uuid(),
    ...timestamps(),
  },
  (t) => [index('auth_session_user_id_idx').on(t.userId)],
);

export const authAccount = pgTable(
  'auth_account',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    /** Haché Argon2id, jamais en clair. */
    password: text(),
    /** Jetons des fournisseurs externes, chiffrés par Better Auth (encryptOAuthTokens). */
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    ...timestamps(),
  },
  (t) => [index('auth_account_user_id_idx').on(t.userId)],
);

export const authVerification = pgTable(
  'auth_verification',
  {
    id: primaryId(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
);

/**
 * Double authentification (module two-factor de Better Auth) : secret TOTP et 10 codes de
 * secours, chiffrés par Better Auth (RG-01-11).
 */
export const authTwoFactor = pgTable(
  'auth_two_factor',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('auth_two_factor_user_id_idx').on(t.userId),
    index('auth_two_factor_secret_idx').on(t.secret),
  ],
);
