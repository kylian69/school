import type { ReactNode } from 'react';
import { sectionsVisibles } from '@/components/parametres/sections';
import { SousNavigation } from '@/components/parametres/sous-navigation';
import { getContexte } from '@/lib/contexte';

/** Menu « Paramètres » : sections visibles selon les permissions de la personne. */
export default async function ParametresLayout({ children }: { children: ReactNode }) {
  const contexte = await getContexte();
  const sections = sectionsVisibles(contexte?.permissions ?? []);
  return (
    <>
      {sections.length > 1 ? <SousNavigation sections={sections} /> : null}
      {children}
    </>
  );
}
