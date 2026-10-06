import { Corbeille } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { ElementsCorbeille } from './elements-corbeille';

const t = fr.corbeille;
export const metadata: Metadata = { title: t.titre };

/** E-01-10 · Corbeille : éléments supprimés, auteur, date d'effacement, restauration (US-01-16). */
export default async function CorbeillePage() {
  if (!(await getContexte())?.permissions.includes('corbeille:restaurer')) notFound();
  const { data } = await apiGet('/api/corbeille', Corbeille);
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="max-w-2xl text-sm text-muted">{t.aide}</p>
      </div>
      <Card>
        {data ? (
          <ElementsCorbeille elements={data.elements} />
        ) : (
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        )}
      </Card>
    </>
  );
}
