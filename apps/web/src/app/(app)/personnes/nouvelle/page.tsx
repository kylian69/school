import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getContexte } from '@/lib/contexte';
import { CreationPersonne } from './creation-personne';

export const metadata: Metadata = { title: fr.personnes.creation.titre };

/** Création d'une fiche, avec recherche des doublons (RG-01-07). */
export default async function NouvellePersonnePage() {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('apprenants:inviter') && !permissions.includes('personnel:inviter'))
    notFound();
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{fr.personnes.titre}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {fr.personnes.creation.titre}
        </h1>
      </div>
      <Card className="max-w-3xl">
        <CreationPersonne />
      </Card>
    </>
  );
}
