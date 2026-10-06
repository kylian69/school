import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  ecolesDuCompte,
  fichesDuCompte,
  newId,
  type Database,
} from '@scolaly/db';
import { emailLienMagique } from '@scolaly/contracts';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import type { EmailsQueue } from '../shared/emails.js';
import { valkeySecondaryStorage } from '../shared/valkey.js';
import { hashPassword, verifyPassword } from './password.js';

export const AUTH_BASE_PATH = '/api/auth';

/** En-tête interne qui porte l'adresse IP du client jusqu'à Better Auth. */
export const CLIENT_IP_HEADER = 'x-scolaly-client-ip';

/** Longueur minimale des mots de passe (RG-01-10). */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Authentification (architecture section 4) : sessions côté serveur (base et Valkey) transmises par
 * un cookie HttpOnly, Secure et SameSite=Lax ; mots de passe Argon2id ; limitation de débit dans
 * Valkey. Les comptes sont créés sur invitation (RG-01-08) : l'inscription libre est fermée.
 */
export function createAuth(env: Env, db: Database, valkey: Redis, emails?: EmailsQueue) {
  const production = env.NODE_ENV === 'production';
  return betterAuth({
    appName: 'Scolaly',
    baseURL: env.PUBLIC_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
      },
    }),
    user: { modelName: 'auth_user' },
    databaseHooks: {
      session: {
        create: {
          // RG-01-29 : à la connexion, l'école active est la première école du compte ; la
          // personne en change ensuite avec le sélecteur, sans se reconnecter.
          before: async (session) => {
            // RG-01-09 : un compte désactivé dans toutes ses écoles ne peut plus se connecter.
            const fiches = await fichesDuCompte(db, session.userId);
            if (fiches.actives === 0 && fiches.desactivees > 0) return false;
            const [premiere] = await ecolesDuCompte(db, session.userId);
            return { data: { ...session, activeOrganisationId: premiere?.organisationId ?? null } };
          },
        },
      },
    },
    session: {
      modelName: 'auth_session',
      storeSessionInDatabase: true,
      additionalFields: {
        activeOrganisationId: { type: 'string', required: false, input: false },
      },
    },
    account: { modelName: 'auth_account', encryptOAuthTokens: true },
    verification: { modelName: 'auth_verification' },
    secondaryStorage: valkeySecondaryStorage(valkey),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    rateLimit: {
      enabled: true,
      storage: 'secondary-storage',
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 10 } },
    },
    advanced: {
      cookiePrefix: 'scolaly',
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: production },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: () => newId() },
    },
    logger: { level: production ? 'error' : 'warn' },
    plugins: [
      // US-01-08, RG-01-10 : lien magique valable 15 minutes, à usage unique, stocké haché ;
      // envoyé seulement à un compte existant, avec la même réponse dans tous les cas.
      magicLink({
        expiresIn: 15 * 60,
        disableSignUp: true,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          if (!emails) return;
          const [compte] = await db
            .select({ id: authUser.id })
            .from(authUser)
            .where(eq(authUser.email, email.toLowerCase()));
          if (!compte) return;
          const fiches = await fichesDuCompte(db, compte.id);
          if (fiches.actives === 0 && fiches.desactivees > 0) return;
          await emails.envoyer(emailLienMagique({ to: email, lien: url }));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Crée un compte avec mot de passe (utilisé par l'invitation en I1.2 et par les données de
 * démonstration). La règle de longueur RG-01-10 s'applique aussi ici.
 */
export async function createPasswordAccount(
  auth: Auth,
  input: { email: string; name: string; password: string },
): Promise<{ userId: string }> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      email: input.email.toLowerCase(),
      name: input.name,
      emailVerified: true,
    },
    { method: 'admin' },
  );
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await context.password.hash(input.password),
  });
  return { userId: user.id };
}
