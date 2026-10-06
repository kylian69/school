import { ApercuImport } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { EtapesImport } from '../etapes-import';
import { CorrespondanceImport } from './correspondance-import';

export const metadata: Metadata = { title: fr.imports.titre };

/** E-01-06 · Assistant d'import, étapes 2 et 3 : correspondance des colonnes et aperçu (RG-01-18). */
export default async function ImportEnCoursPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('personnes:importer')) notFound();
  const { id } = await params;
  const { data: apercu } = await apiGet(`/api/imports/${id}`, ApercuImport);
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{fr.personnes.titre}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {fr.imports.titre}
        </h1>
        {apercu ? <p className="text-sm text-muted">{apercu.fichierNom}</p> : null}
      </div>
      <EtapesImport courante={apercu && apercu.champsManquants.length === 0 ? 3 : 2} />
      {apercu ? (
        <CorrespondanceImport apercu={apercu} />
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {fr.imports.introuvable}
          </p>
        </Card>
      )}
    </>
  );
}
