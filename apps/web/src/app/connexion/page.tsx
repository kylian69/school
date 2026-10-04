import type { Metadata } from 'next';
import { Card, Logo } from '@scolaly/ui';
import { fr } from '@/i18n/fr';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: fr.connexion.titre };

export default function ConnexionPage() {
  return (
    <main className="bg-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-[400px] flex-col gap-6 p-6 sm:p-8">
        <Logo />
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em]">{fr.connexion.titre}</h1>
          <p className="text-sm text-muted">{fr.connexion.sousTitre}</p>
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
