import { ApparenceEcole } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { ApparenceEditeur } from './apparence-editeur';

const t = fr.apparence;
export const metadata: Metadata = { title: t.titre };

/** E-01-09 · Apparence : nom affiché, logo et couleur, avec aperçu immédiat (US-01-14). */
export default async function ApparencePage() {
  const contexte = await getContexte();
  if (!contexte?.permissions.includes('apparence:gerer')) notFound();
  const { data } = await apiGet('/api/apparence', ApparenceEcole);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="max-w-2xl text-sm text-muted">{t.aide}</p>
      </div>
      {data ? (
        <ApparenceEditeur apparence={data} nomEcole={contexte.ecoleActive?.nom ?? ''} />
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
