import { createDatabase } from '@scolaly/db';
import { ROLES_PAR_DEFAUT } from '@scolaly/contracts';
import { buildDemoDataset, seedDemoDataset, seedDemoDroits } from '@scolaly/db/demo';
import { createPasswordAccount, type Auth } from '../auth/auth.js';
import { creerSuperAdministrateur } from '../modules/plateforme/index.js';

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
  /** En mode SaaS : crée aussi le super-administrateur de démonstration de la console. */
  platformUrl?: string;
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
  const userIds = new Map<string, string>();
  for (const compte of dataset.comptes) {
    const existant = await context.internalAdapter.findUserByEmail(compte.email);
    if (existant) {
      userIds.set(compte.email, existant.user.id);
      continue;
    }
    const { userId } = await createPasswordAccount(options.auth, {
      email: compte.email,
      name: compte.name,
      password: options.password,
    });
    userIds.set(compte.email, userId);
    comptesCrees.push(compte.email);
  }
  // Rôles des écoles et rattachement de chaque compte à sa fiche et à son rôle (I1.2).
  const proprietaire = createDatabase(options.migratorUrl, { max: 2 });
  try {
    await seedDemoDroits(proprietaire.db, dataset, ROLES_PAR_DEFAUT, userIds);
  } finally {
    await proprietaire.close();
  }
  if (options.platformUrl) {
    const { cree } = await creerSuperAdministrateur({
      auth: options.auth,
      platformUrl: options.platformUrl,
      ...dataset.superAdministrateur,
      password: options.password,
    });
    if (cree) comptesCrees.push(dataset.superAdministrateur.email);
  }
  return { donneesEcrites, comptesCrees };
}
