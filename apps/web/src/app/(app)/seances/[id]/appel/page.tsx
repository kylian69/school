import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getContexte } from '@/lib/contexte';
import { EcranAppel } from './ecran-appel';

export const metadata: Metadata = { title: fr.emargement.appelEnCours };

/** US-06-01, US-06-03 · Écran de l'intervenant : QR rotatif, code de secours, appel en direct. */
export default async function AppelPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('emargement:animer')) notFound();
  const { id } = await params;
  return <EcranAppel seanceId={id} />;
}
