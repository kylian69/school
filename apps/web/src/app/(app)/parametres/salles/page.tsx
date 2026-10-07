import { ListeSalles, OrganisationDetail } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { EditeurSalles } from './editeur-salles';

const t = fr.salles;
export const metadata: Metadata = { title: t.titre };

/** E-02-06 · Salles : par établissement, filtres par capacité et équipement (US-02-09). */
export default async function SallesPage({
  searchParams,
}: {
  searchParams: Promise<{ etablissementId?: string; capaciteMin?: string; equipement?: string }>;
}) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('salles:lire') && !permissions.includes('salles:gerer')) notFound();
  const filtres = await searchParams;
  const params = new URLSearchParams(
    Object.entries(filtres).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const [{ data }, { data: organisation }] = await Promise.all([
    apiGet(`/api/salles?${params.toString()}`, ListeSalles),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="text-sm text-muted">{t.aide}</p>
      </div>
      {data ? (
        <EditeurSalles
          liste={data}
          filtres={filtres}
          etablissements={(organisation?.etablissements ?? []).filter((e) => e.statut === 'actif')}
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
