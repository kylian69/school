import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getContexte } from '@/lib/contexte';
import { ImportPhotos } from './import-photos';

export const metadata: Metadata = { title: fr.photo.import.titre };

/** US-01-20 · Import des photos par archive ZIP nommée par matricule. */
export default async function ImportPhotosPage() {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('apprenants:inviter') && !permissions.includes('personnel:inviter')) {
    notFound();
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{fr.personnes.titre}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {fr.photo.import.titre}
        </h1>
      </div>
      <Card className="max-w-2xl">
        <ImportPhotos />
      </Card>
    </>
  );
}
