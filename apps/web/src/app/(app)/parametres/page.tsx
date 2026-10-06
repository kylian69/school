import { notFound, redirect } from 'next/navigation';
import { sectionsVisibles } from '@/components/parametres/sections';
import { getContexte } from '@/lib/contexte';

/** Entrée du menu « Paramètres » : première section accessible. */
export default async function ParametresPage() {
  const contexte = await getContexte();
  const [premiere] = sectionsVisibles(contexte?.permissions ?? []);
  if (!premiere) notFound();
  redirect(premiere.href);
}
