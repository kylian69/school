// Préréglages Vitest partagés.
import { defineConfig } from 'vitest/config';

export const baseTestConfig = {
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  passWithNoTests: false,
  coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
};

export default defineConfig({ test: baseTestConfig });
