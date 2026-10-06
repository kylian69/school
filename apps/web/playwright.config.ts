import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);

/** Tests de bout en bout : parcours, accessibilité (axe-core, ADR 0001), 360 px pour le mobile. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, locale: 'fr-FR', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'ordinateur',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-360',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
