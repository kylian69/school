import { baseTestConfig } from '@scolaly/config/vitest';
import { defineConfig } from 'vitest/config';

// Calculs métier : 100 % des branches couvertes (definition of done).
export default defineConfig({
  test: {
    ...baseTestConfig,
    coverage: {
      ...baseTestConfig.coverage,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
