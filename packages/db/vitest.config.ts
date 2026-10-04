import { baseTestConfig } from '@scolaly/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...baseTestConfig,
    globalSetup: ['./test/global-setup.ts'],
    // Les tests partagent une base jetable : pas d'exécution parallèle entre fichiers.
    fileParallelism: false,
  },
});
