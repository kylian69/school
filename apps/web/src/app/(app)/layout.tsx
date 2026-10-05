import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getContexte } from '@/lib/contexte';
import { getStatutConsole } from '@/lib/plateforme';
import { getSession } from '@/lib/session';

/**
 * Espace connecté : sans session valide, retour à la page de connexion ; si le rôle exige la double
 * authentification et qu'elle n'est pas active, passage par sa mise en place (RG-00-13).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/connexion');
  const [console, contexte] = await Promise.all([getStatutConsole(), getContexte()]);
  if (contexte?.doubleAuthentificationExigee && !contexte.doubleAuthentificationActive) {
    redirect('/securite');
  }
  return (
    <AppShell
      user={session.user}
      consoleAccessible={console.role !== null || console.doubleAuthentificationRequise}
      contexte={contexte}
    >
      {children}
    </AppShell>
  );
}
