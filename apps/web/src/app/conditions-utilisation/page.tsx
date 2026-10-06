import { Card, Logo } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';

export const metadata: Metadata = { title: fr.conditions.titre };

/** Conditions d'utilisation : texte provisoire, en attente du texte juridique définitif. */
export default function ConditionsPage() {
  return (
    <main className="bg-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-2xl flex-col gap-4 p-6 sm:p-8">
        <Logo />
        <h1 className="text-[26px] font-[650] tracking-[-0.035em]">{fr.conditions.titre}</h1>
        <p className="text-sm">{fr.conditions.provisoire}</p>
      </Card>
    </main>
  );
}
