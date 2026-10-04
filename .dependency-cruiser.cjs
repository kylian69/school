// Règles de dépendance entre modules (architecture, section 2), vérifiées par la CI.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dependance-non-resolue',
      severity: 'error',
      comment: 'Tout import doit se résoudre (paquet déclaré et construit, fichier existant).',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'dependance-non-declaree',
      severity: 'error',
      comment: 'Tout paquet importé doit figurer dans le package.json de l’espace de travail.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      comment: 'Les dépendances circulaires sont interdites.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'paquets-sans-applications',
      severity: 'error',
      comment: 'Un paquet ne dépend jamais d’une application.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'applications-cloisonnees',
      severity: 'error',
      comment: 'Une application n’importe pas le code d’une autre application.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'domain-pur',
      severity: 'error',
      comment:
        'packages/domain ne dépend d’aucun framework, d’aucun accès réseau ou base, ni d’aucun autre paquet.',
      from: { path: '^packages/domain/' },
      to: {
        pathNot: ['^packages/domain/', '^node_modules/\\.pnpm/(vitest|@vitest)'],
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'domain-sans-module-reseau',
      severity: 'error',
      comment: 'packages/domain n’utilise ni réseau, ni système de fichiers, ni processus.',
      from: { path: '^packages/domain/src/(?!.*\\.test\\.ts$)' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|net|http|https|http2|dgram|dns|tls|child_process|cluster|worker_threads)(/|$)',
      },
    },
    {
      name: 'contracts-autonome',
      severity: 'error',
      comment: 'packages/contracts ne dépend d’aucun autre paquet de Scolaly.',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/', pathNot: '^packages/contracts/' },
    },
    {
      name: 'web-limite-a-contracts-et-ui',
      severity: 'error',
      comment: 'apps/web ne dépend que de contracts et ui (jamais de la base ni du domaine).',
      from: { path: '^apps/web/' },
      to: { path: '^packages/', pathNot: '^packages/(contracts|ui)/' },
    },
    {
      name: 'ui-sans-donnees',
      severity: 'error',
      comment: 'packages/ui ne dépend que de contracts.',
      from: { path: '^packages/ui/' },
      to: { path: '^packages/', pathNot: '^packages/(ui|contracts)/' },
    },
    {
      name: 'modules-api-par-service-public',
      severity: 'error',
      comment:
        'Un module de l’API n’appelle un autre module que par son point d’entrée public (index.ts).',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(^|/)(dist|\\.next|coverage)/', '\\.config\\.(ts|js|cjs|mjs)$'] },
    tsPreCompilationDeps: true,
    // Alias « @/ » de l'interface (seul paquet qui en utilise).
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    combinedDependencies: true,
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.d.ts'],
    },
  },
};
