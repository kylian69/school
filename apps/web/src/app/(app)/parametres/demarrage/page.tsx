import { Demarrage } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { EtapesDemarrage } from './etapes-demarrage';

const t = fr.demarrage;
export const metadata: Metadata = { title: fr.parametres.sections.demarrage };

/** E-01-01 · Liste de démarrage : étapes de configuration et avancement (US-01-01). */
export default async function DemarragePage() {
  const contexte = await getContexte();
  if (!contexte?.permissions.includes('organisation:modifier')) notFound();
  const { data } = await apiGet('/api/demarrage', Demarrage);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {data?.termine ? t.titreTermine : t.titre}
        </h1>
        <p className="max-w-2xl text-sm text-muted">{t.aide}</p>
      </div>
      {data ? (
        <EtapesDemarrage demarrage={data} />
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      )}
    </>
  );
}
