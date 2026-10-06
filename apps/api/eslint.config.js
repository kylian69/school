import base from '@scolaly/config/eslint';

export default [
  ...base,
  {
    rules: {
      // NestJS s'appuie sur des classes à décorateurs, parfois sans membres.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
