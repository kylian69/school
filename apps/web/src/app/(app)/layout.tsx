import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getSession } from '@/lib/session';

/** Espace connecté : sans session valide, retour à la page de connexion. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/connexion');
  return <AppShell user={session.user}>{children}</AppShell>;
}
