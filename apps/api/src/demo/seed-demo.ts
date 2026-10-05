import { createDatabase } from '@scolaly/db';
import { buildDemoDataset, seedDemoDataset } from '@scolaly/db/demo';
import { createPasswordAccount, type Auth } from '../auth/auth.js';

export interface DemoSeedResult {
  donneesEcrites: boolean;
  comptesCrees: string[];
}

/**
 * Charge le jeu de démonstration (données avec le rôle propriétaire) et crée les comptes de
 * démonstration par Better Auth. Idempotent. Jamais en production (plan, section 5).
 */
export async function seedDemo(options: {
  auth: Auth;
  migratorUrl: string;
  password: string;
}): Promise<DemoSeedResult> {
  const dataset = buildDemoDataset();
  const owner = createDatabase(options.migratorUrl, { max: 2 });
  let donneesEcrites: boolean;
  try {
    donneesEcrites = await seedDemoDataset(owner.db, dataset);
  } finally {
    await owner.close();
  }

  const context = await options.auth.$context;
  const comptesCrees: string[] = [];
  for (const compte of dataset.comptes) {
    if (await context.internalAdapter.findUserByEmail(compte.email)) continue;
    await createPasswordAccount(options.auth, {
      email: compte.email,
      name: compte.name,
      password: options.password,
    });
    comptesCrees.push(compte.email);
  }
  return { donneesEcrites, comptesCrees };
}
