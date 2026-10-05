import { createDatabase, plateformeMembre } from '@scolaly/db';
import { createPasswordAccount, type Auth } from '../../auth/auth.js';

/**
 * Crée (ou retrouve) un compte et lui donne le rôle de super-administrateur de la plateforme.
 * Utilisé à l'installation du SaaS et par le jeu de démonstration. Idempotent.
 */
export async function creerSuperAdministrateur(options: {
  auth: Auth;
  platformUrl: string;
  email: string;
  name: string;
  password: string;
}): Promise<{ userId: string; cree: boolean }> {
  const context = await options.auth.$context;
  const existant = await context.internalAdapter.findUserByEmail(options.email.toLowerCase());
  const userId =
    existant?.user.id ??
    (
      await createPasswordAccount(options.auth, {
        email: options.email,
        name: options.name,
        password: options.password,
      })
    ).userId;
  const plateforme = createDatabase(options.platformUrl, { max: 1 });
  try {
    const inseres = await plateforme.db
      .insert(plateformeMembre)
      .values({ userId, role: 'super_administrateur' })
      .onConflictDoNothing()
      .returning({ id: plateformeMembre.id });
    return { userId, cree: inseres.length > 0 };
  } finally {
    await plateforme.close();
  }
}
