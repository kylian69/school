import {
  AffectationsPromotion,
  CalendrierPromotion,
  DetailPromotion,
  ListeModelesRythme,
  ListePromotions,
} from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { ChangementVersion } from './changement-version';
import { OngletApprenants } from './onglet-apprenants';
import { OngletGroupes } from './onglet-groupes';
import { OngletIntervenants } from './onglet-intervenants';
import { OngletRythme } from './onglet-rythme';

const t = fr.scolarite;
export const metadata: Metadata = { title: t.titre };

const VUES = ['apprenants', 'groupes', 'intervenants', 'rythme'] as const;
type Vue = (typeof VUES)[number];

/** E-02-05 · Promotion : apprenants (inscriptions, statuts), groupes, intervenants. */
export default async function PromotionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const { id } = await params;
  const { vue: demandee } = await searchParams;
  const permissions = (await getContexte())?.permissions ?? [];
  // E-03-05 : l'onglet du rythme, pour qui lit ou définit les rythmes d'alternance.
  const vues = VUES.filter(
    (v) =>
      v !== 'rythme' ||
      permissions.includes('rythmes:lire') ||
      permissions.includes('rythmes:gerer'),
  );
  const vue: Vue = vues.find((v) => v === demandee) ?? 'apprenants';
  const { data: promo, status } = await apiGet(`/api/promotions/${id}`, DetailPromotion);
  if (status === 404 || status === 403) notFound();
  if (!promo) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {t.indisponible}
        </p>
      </Card>
    );
  }
  const [{ data: affectations }, { data: suivantes }, { data: rythme }, { data: modeles }] =
    await Promise.all([
      vue === 'intervenants'
        ? apiGet(`/api/promotions/${id}/affectations`, AffectationsPromotion)
        : Promise.resolve({ data: null }),
      vue === 'apprenants' && promo.modifiable
        ? apiGet(`/api/promotions?formationId=${promo.formation.id}`, ListePromotions)
        : Promise.resolve({ data: null }),
      vue === 'rythme'
        ? apiGet(`/api/promotions/${id}/rythme`, CalendrierPromotion)
        : Promise.resolve({ data: null }),
      vue === 'rythme'
        ? apiGet('/api/rythmes/modeles', ListeModelesRythme)
        : Promise.resolve({ data: null }),
    ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          <Link
            href={`/promotions?annee=${promo.anneeScolaire.id}`}
            className="underline-offset-4 hover:underline"
          >
            {t.titre}
          </Link>
        </p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {promo.libelle}
        </h1>
        <p className="text-sm text-muted">
          {[
            promo.etablissement.nom,
            t.anneeFormation(promo.anneeFormation),
            `${formatDate(promo.dateDebut)} → ${formatDate(promo.dateFin)}`,
          ].join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone="accent">{t.effectifs(promo.effectifs.inscrits)}</Badge>
          <Link
            href={`/formations/${promo.formation.id}?version=${promo.version.id}`}
            className="text-sm underline underline-offset-4"
          >
            {t.version(promo.version.numero)}
          </Link>
          {promo.changementVersion ? <ChangementVersion promotion={promo} /> : null}
        </div>
        {promo.modifiable ? null : <p className="text-sm text-muted">{t.lectureSeule}</p>}
      </div>
      <nav aria-label={t.navigationVues} className="flex flex-wrap gap-1 border-b border-line">
        {vues.map((v) => (
          <Link
            key={v}
            href={`/promotions/${promo.id}?vue=${v}`}
            aria-current={v === vue ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:font-medium aria-[current=page]:text-fg"
          >
            {t.vues[v]}
          </Link>
        ))}
      </nav>
      {vue === 'apprenants' ? (
        <OngletApprenants
          promotion={promo}
          suivantes={(suivantes?.promotions ?? []).filter((p) => p.dateDebut > promo.dateDebut)}
        />
      ) : null}
      {vue === 'groupes' ? <OngletGroupes promotion={promo} /> : null}
      {vue === 'rythme' ? (
        rythme && modeles ? (
          <OngletRythme promotion={promo} rythme={rythme} modeles={modeles} />
        ) : (
          <Card>
            <p role="alert" className="text-sm">
              {fr.rythmes.indisponible}
            </p>
          </Card>
        )
      ) : null}
      {vue === 'intervenants' ? (
        affectations ? (
          <OngletIntervenants promotion={promo} affectations={affectations} />
        ) : (
          <Card>
            <p role="alert" className="text-sm">
              {t.indisponible}
            </p>
          </Card>
        )
      ) : null}
    </>
  );
}
