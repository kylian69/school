import {
  ListeAnnees,
  ListeFormations,
  ListePromotions,
  OrganisationDetail,
  STATUTS_APPRENANT,
} from '@scolaly/contracts';
import { Badge, Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { SELECT } from '../formations/envoi';
import { ActionsPromotions } from './actions-promotions';

const t = fr.scolarite;
export const metadata: Metadata = { title: t.titre };

/** E-02-04 · Promotions de l'année : par formation et établissement, effectifs par statut. */
export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!permissions.includes('promotions:lire') && !permissions.includes('promotions:gerer'))
    notFound();
  const { annee: demandee } = await searchParams;
  const [{ data: annees }, { data: formations }, { data: organisation }] = await Promise.all([
    apiGet('/api/annees', ListeAnnees),
    apiGet('/api/formations?statut=active', ListeFormations),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  const liste = annees?.annees ?? [];
  const annee =
    liste.find((a) => a.id === demandee) ?? liste.find((a) => a.statut === 'en_cours') ?? liste[0];
  const { data } = annee
    ? await apiGet(`/api/promotions?anneeScolaireId=${annee.id}`, ListePromotions)
    : { data: null };
  const promotions = data?.promotions ?? [];
  const parFormation = [...new Set(promotions.map((p) => p.formation.intitule))];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
          {annee ? <p className="text-sm text-muted">{annee.libelle}</p> : null}
        </div>
        {data?.creation && annee ? (
          <ActionsPromotions
            annee={annee}
            annees={liste}
            formations={formations?.formations ?? []}
            etablissements={(organisation?.etablissements ?? []).filter(
              (e) => e.statut === 'actif',
            )}
          />
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/promotions" method="get">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtre-annee">{t.annee}</Label>
          <select id="filtre-annee" name="annee" defaultValue={annee?.id} className={SELECT}>
            {liste.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t.filtrer}
        </Button>
      </form>

      {!data && annee ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : promotions.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        parFormation.map((intitule) => (
          <section key={intitule} aria-label={intitule} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{intitule}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {promotions
                .filter((p) => p.formation.intitule === intitule)
                .map((p) => (
                  <li key={p.id}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-semibold">
                          <Link
                            href={`/promotions/${p.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {p.libelle}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted">
                          {[
                            p.etablissement.nom,
                            t.anneeFormation(p.anneeFormation),
                            t.version(p.version.numero),
                          ].join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="accent">{t.effectifs(p.effectifs.inscrits)}</Badge>
                        {STATUTS_APPRENANT.filter((s) => p.effectifs.parStatut[s] > 0).map((s) => (
                          <Badge
                            key={s}
                          >{`${t.statuts[s]} ${String(p.effectifs.parStatut[s])}`}</Badge>
                        ))}
                        {p.effectifs.preinscrits > 0 ? (
                          <Badge tone="warn">{t.preinscrits(p.effectifs.preinscrits)}</Badge>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
