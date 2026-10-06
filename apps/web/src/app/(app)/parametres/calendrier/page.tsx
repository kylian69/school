import { CalendrierAnnee, ListeAnnees, OrganisationDetail } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { CalendrierEditeur } from './calendrier-editeur';

const t = fr.calendrier;
export const metadata: Metadata = { title: t.titre };

/** E-01-03 · Calendrier de l'année : périodes, jours fériés et fermetures (US-01-03). */
export default async function CalendrierPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!permissions.includes('calendrier:lire') && !permissions.includes('calendrier:gerer'))
    notFound();
  const { annee: demandee } = await searchParams;
  const [{ data: liste }, { data: organisation }] = await Promise.all([
    apiGet('/api/annees', ListeAnnees),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  // Année demandée, sinon l'année en cours, sinon la plus récente.
  const choisie =
    liste?.annees.find((a) => a.id === demandee) ??
    liste?.annees.find((a) => a.statut === 'en_cours') ??
    liste?.annees[0];
  const { data: annee } = choisie
    ? await apiGet(`/api/annees/${choisie.id}`, CalendrierAnnee)
    : { data: null };

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      </div>
      {liste ? (
        <CalendrierEditeur
          annees={liste.annees}
          annee={annee}
          etablissements={(organisation?.etablissements ?? []).filter((e) => e.statut === 'actif')}
          modifiable={permissions.includes('calendrier:gerer')}
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
