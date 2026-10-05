import { InvitationPublique } from '@scolaly/contracts';
import { Button, Card, Logo } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { ActivationForm } from './activation-form';

const t = fr.activation;
export const metadata: Metadata = { title: t.titre };

/** Parcours d'activation (module 01) : moins de 90 secondes sur mobile, sans aide. */
export default async function ActivationPage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const { data: invitation } = await apiGet(
    `/api/invitations/${encodeURIComponent(jeton)}`,
    InvitationPublique,
  );

  return (
    <main className="bg-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-[420px] flex-col gap-6 p-6 sm:p-8">
        <Logo />
        <h1 className="text-[26px] font-[650] tracking-[-0.035em]">{t.titre}</h1>
        {invitation?.etat === 'valide' ? (
          <>
            <p className="text-sm text-muted">{t.bonjour(invitation.prenom, invitation.ecole)}</p>
            <ActivationForm jeton={jeton} email={invitation.email} />
          </>
        ) : (
          <>
            <p role="alert" className="text-sm">
              {t.etats[invitation?.etat ?? 'invalide']}
            </p>
            <Button asChild variant="secondary">
              <Link href="/connexion">{t.seConnecter}</Link>
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
