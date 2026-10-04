import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { ThemeProvider } from '@/components/theme-provider';
import { fr } from '@/i18n/fr';
import './globals.css';

export const metadata: Metadata = {
  title: { default: fr.app.nom, template: `%s · ${fr.app.nom}` },
  description: fr.app.description,
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: fr.app.nom, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c10' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce de la CSP (proxy.ts), transmis au script de thème de next-themes.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang="fr"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider {...(nonce ? { nonce } : {})}>{children}</ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
