import path from 'node:path';
import type { NextConfig } from 'next';

/** API servie sur la même origine sous /api (Caddy en production, réécriture en développement). */
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  output: 'standalone',
  // Racine du monorepo : la sortie « standalone » embarque les paquets de l'espace de travail.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ]);
  },
};

export default config;
