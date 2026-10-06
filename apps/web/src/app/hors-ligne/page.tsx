import { Card, Logo } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: fr.horsLigne.titre };

/** Page affichée par le service worker quand une page n'est pas joignable sans réseau. */
export default function HorsLignePage() {
  return (
    <main className="bg-grid flex min-h-dvh items-center justify-center px-4">
      <Card className="flex w-full max-w-[400px] flex-col gap-4 p-6">
        <Logo />
        <h1 className="text-xl font-semibold">{fr.horsLigne.titre}</h1>
        <p className="text-sm text-muted">{fr.horsLigne.message}</p>
        <RetryButton />
      </Card>
    </main>
  );
}
