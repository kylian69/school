import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getContexte } from '@/lib/contexte';
import { getRolePlateforme } from '@/lib/plateforme';
import { getSession } from '@/lib/session';

/** Espace connecté : sans session valide, retour à la page de connexion. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/connexion');
  const [rolePlateforme, contexte] = await Promise.all([getRolePlateforme(), getContexte()]);
  return (
    <AppShell user={session.user} consoleAccessible={rolePlateforme !== null} contexte={contexte}>
      {children}
    </AppShell>
  );
}
