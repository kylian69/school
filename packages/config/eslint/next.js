// Configuration ESLint pour apps/web : règles communes, Next.js et accessibilité (jsx-a11y).
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
import base from './index.js';

export default [
  ...base,
  ...nextVitals,
  {
    rules: {
      'no-console': 'error',
    },
  },
  // Fichiers JavaScript (scripts, configurations) : analysés par l'analyseur de Next.js, sans types.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Fichiers servis tels quels (service worker en JavaScript simple).
  { ignores: ['public/**'] },
];
