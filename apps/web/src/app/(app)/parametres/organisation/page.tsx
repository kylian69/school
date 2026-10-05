import { OrganisationDetail } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { OrganisationEditeur } from './organisation-editeur';

const t = fr.organisation;
export const metadata: Metadata = { title: t.titre };

/** E-01-02 · Organisation et établissements (US-01-02). */
export default async function OrganisationPage() {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!permissions.includes('organisation:lire') && !permissions.includes('organisation:modifier'))
    notFound();
  const { data } = await apiGet('/api/organisation', OrganisationDetail);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      </div>
      {data ? (
        <OrganisationEditeur
          organisation={data}
          modifiable={permissions.includes('organisation:modifier')}
        />
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
