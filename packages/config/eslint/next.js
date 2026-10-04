// Configuration ESLint pour apps/web : règles communes, Next.js et accessibilité (jsx-a11y).
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from './index.js';

export default [
  ...base,
  ...nextVitals,
  {
    rules: {
      'no-console': 'error',
    },
  },
];
