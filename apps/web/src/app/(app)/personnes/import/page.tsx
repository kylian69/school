import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { getContexte } from '@/lib/contexte';
import { DepotImport } from './depot-import';
import { EtapesImport } from './etapes-import';

export const metadata: Metadata = { title: fr.imports.titre };

/** E-01-06 · Assistant d'import, étape 1 : type de personnes et fichier (US-01-05). */
export default async function ImportPage() {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('personnes:importer')) notFound();
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{fr.personnes.titre}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {fr.imports.titre}
        </h1>
      </div>
      <EtapesImport courante={1} />
      <Card className="max-w-2xl">
        <DepotImport />
      </Card>
    </>
  );
}
