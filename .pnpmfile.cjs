// Ajustements de la résolution des dépendances (pnpm).
//
// Better Auth déclare comme pairs optionnels de nombreux frameworks (Next.js, React, Vue,
// Prisma, drizzle-kit, Vitest…). pnpm les relie dès qu'ils existent ailleurs dans le monorepo,
// et `pnpm deploy` les embarque alors dans l'image de l'API (environ 300 Mo de Next.js, des
// binaires esbuild signalés par Trivy). Seuls drizzle-orm et pg servent à Scolaly.
const BETTER_AUTH_PEERS_KEPT = new Set(['drizzle-orm', 'pg']);

function readPackage(pkg) {
  if (pkg.name === 'better-auth') {
    for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (!BETTER_AUTH_PEERS_KEPT.has(name)) delete pkg[field][name];
      }
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
