import { Button, Card, Logo } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getContexte } from '@/lib/contexte';
import { getStatutConsole } from '@/lib/plateforme';
import { getSession } from '@/lib/session';
import { DoubleAuthentificationSetup } from './double-authentification-setup';
import { SeDeconnecter } from './se-deconnecter';

const t = fr.securite;
export const metadata: Metadata = { title: t.titre };

/**
 * Sécurité de mon compte : mise en place de la double authentification (RG-01-11). Page hors de
 * l'espace connecté, car c'est là qu'arrive une personne dont le rôle l'exige (RG-00-13, RG-19-10).
 */
export default async function SecuritePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');
  const [contexte, console] = await Promise.all([getContexte(), getStatutConsole()]);
  const active = contexte?.doubleAuthentificationActive ?? false;
  const exigee =
    contexte?.doubleAuthentificationExigee === true || console.doubleAuthentificationRequise;

  return (
    <main className="bg-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-[480px] flex-col gap-6 p-6 sm:p-8">
        <Logo />
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em]">{t.titre}</h1>
          <p className="text-sm text-muted">{session.user.email}</p>
        </div>
        <section aria-labelledby="titre-double-authentification" className="flex flex-col gap-4">
          <h2 id="titre-double-authentification" className="text-base font-semibold">
            {t.doubleAuthentification}
          </h2>
          {active ? (
            <>
              <p role="status" className="text-sm">
                {t.active}
              </p>
              <p className="text-sm text-muted">{t.perdu}</p>
              <Button asChild variant="secondary">
                <Link href="/">{t.retour}</Link>
              </Button>
            </>
          ) : (
            <>
              <p className={exigee ? 'text-sm font-medium' : 'text-sm text-muted'}>
                {exigee ? t.exigee : t.inactive}
              </p>
              <DoubleAuthentificationSetup />
              {exigee ? <SeDeconnecter /> : null}
            </>
          )}
        </section>
      </Card>
    </main>
  );
}
