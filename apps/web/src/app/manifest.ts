import type { MetadataRoute } from 'next';
import { fr } from '@/i18n/fr';

/** Manifeste de la PWA installable (module 08). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: fr.app.nom,
    short_name: fr.app.nom,
    description: fr.app.description,
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
