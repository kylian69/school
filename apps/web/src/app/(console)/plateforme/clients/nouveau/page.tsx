import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getRolePlateforme } from '@/lib/plateforme';
import { NouveauClientForm } from './nouveau-client-form';

export const metadata: Metadata = { title: fr.console.nouveau.titre };

/** E-19-02 · Nouveau client : formulaire unique RG-19-01, création en un clic. */
export default async function NouveauClientPage() {
  if ((await getRolePlateforme()) !== 'super_administrateur') notFound();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-[650] tracking-[-0.035em]">{fr.console.nouveau.titre}</h1>
        <p className="text-sm text-muted">{fr.console.nouveau.intro}</p>
      </div>
      <Card className="max-w-3xl">
        <NouveauClientForm />
      </Card>
    </>
  );
}
