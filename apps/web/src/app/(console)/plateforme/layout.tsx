import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { getSession } from '@/lib/session';
import { getStatutConsole } from '@/lib/plateforme';

/** Console de la plateforme (module 19) : n'existe que pour les membres de l'équipe Scolaly. */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  if (!(await getSession())) redirect('/connexion');
  const { role, doubleAuthentificationRequise } = await getStatutConsole();
  // RG-19-10 : les comptes Scolaly mettent en place la double authentification avant tout.
  if (doubleAuthentificationRequise) redirect('/securite');
  if (!role) notFound();
  return <ConsoleShell role={role}>{children}</ConsoleShell>;
}
