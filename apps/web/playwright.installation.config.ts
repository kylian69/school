import { defineConfig, devices } from '@playwright/test';

/**
 * Test de fumée de l'installation Docker Compose (plan, section 5) : Caddy, interface, API,
 * base et stockage réels, jeu de démonstration chargé. Lancé contre une installation déjà démarrée.
 */
export default defineConfig({
  testDir: './e2e-installation',
  retries: process.env.CI ? 1 : 0,
  // Marges pour les machines partagées ou chargées (axe-core, rendu dynamique).
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.INSTALLATION_URL ?? 'https://localhost',
    // Autorité de certification interne de Caddy pour « localhost ».
    ignoreHTTPSErrors: true,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'ordinateur', use: { ...devices['Desktop Chrome'] } }],
});
