import { TableauAssiduite } from '@scolaly/contracts';
import { Badge, Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { SELECT } from '../../formations/envoi';
import { TraiterAlerte } from './traiter-alerte';

const t = fr.assiduite.tableauDeBord;
export const metadata: Metadata = { title: t.titre };

const FILTRES = ['promotionId', 'niveau', 'alertes'] as const;
type Filtres = Partial<Record<(typeof FILTRES)[number], string>>;

/**
 * E-06-07, US-06-10 · Tableau de bord de l'assiduité (I4.4) : indicateurs du périmètre et
 * apprenants qui atteignent un seuil d'alerte (RG-06-23), avec les alertes à traiter.
 */
export default async function TableauDeBordAssiduitePage({
  searchParams,
}: {
  searchParams: Promise<Filtres>;
}) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('assiduite:lire')) notFound();
  const filtres = await searchParams;
  const params = new URLSearchParams(
    FILTRES.flatMap((nom) => (filtres[nom] ? [[nom, filtres[nom]] as [string, string]] : [])),
  );
  const { data } = await apiGet(
    `/api/assiduite/tableau-de-bord?${params.toString()}`,
    TableauAssiduite,
  );
  const choix = [
    [
      'promotionId',
      fr.assiduite.promotion,
      (data?.promotions ?? []).map((p) => [p.id, p.libelle]),
      fr.assiduite.toutes,
    ],
    ['niveau', t.niveauFiltre, Object.entries(t.niveaux), fr.assiduite.tous],
    ['alertes', t.alertesFiltre, [['ouvertes', t.seulementOuvertes]], fr.assiduite.toutes],
  ] as const;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="text-sm text-muted">{t.aide}</p>
        <Link href="/assiduite" className="text-sm text-accent underline">
          {t.lienSuivi}
        </Link>
      </div>

      {data ? (
        <section aria-labelledby="indicateurs">
          <h2 id="indicateurs" className="sr-only">
            {t.indicateurs}
          </h2>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(
              [
                [t.niveau1, data.indicateurs.niveau1],
                [t.niveau2, data.indicateurs.niveau2],
                [t.alertesOuvertes, data.indicateurs.alertesOuvertes],
                [t.demiJournees, data.indicateurs.demiJourneesNonJustifiees],
                [t.justificatifs, data.indicateurs.justificatifsATraiter],
              ] as const
            ).map(([libelle, valeur]) => (
              <Card key={libelle} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted">{libelle}</dt>
                <dd className="text-2xl font-semibold">{valeur}</dd>
              </Card>
            ))}
          </dl>
        </section>
      ) : null}

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        action="/assiduite/tableau-de-bord"
        method="get"
      >
        {choix.map(([nom, libelle, options, vide]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={`filtre-${nom}`}>{libelle}</Label>
            <select
              id={`filtre-${nom}`}
              name={nom}
              defaultValue={filtres[nom] ?? ''}
              className={SELECT}
            >
              <option value="">{vide}</option>
              {options.map(([valeur, texte]) => (
                <option key={valeur} value={valeur}>
                  {texte}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button type="submit" variant="secondary">
          {fr.assiduite.filtrer}
        </Button>
      </form>

      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {fr.assiduite.indisponible}
          </p>
        </Card>
      ) : (
        <section aria-labelledby="apprenants" className="flex flex-col gap-3">
          <h2 id="apprenants" className="text-lg font-semibold">
            {t.apprenants}
          </h2>
          {data.apprenants.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">{t.aucun}</p>
            </Card>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {data.apprenants.map((a) => {
                const nom = `${a.prenom} ${a.nom}`;
                return (
                  <li key={a.personneId}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-medium">{nom}</h3>
                        <span className="flex flex-wrap gap-1">
                          <Badge
                            tone={a.niveau === 2 ? 'bad' : a.niveau === 1 ? 'warn' : 'neutral'}
                          >
                            {t.niveau(a.niveau)}
                          </Badge>
                          {a.promotion ? <Badge>{a.promotion}</Badge> : null}
                          {a.alternant ? (
                            <Badge tone="accent">{fr.assiduite.alternantBadge}</Badge>
                          ) : null}
                        </span>
                      </div>
                      <p className="text-sm">
                        {t.compte(a.demiJourneesNonJustifiees, a.seuils.fenetreJours)}
                        <span className="block text-muted">
                          {t.seuils(a.seuils.niveau1, a.seuils.niveau2)}
                        </span>
                      </p>
                      {a.alertes.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {a.alertes.map((alerte) => (
                            <li
                              key={alerte.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm"
                            >
                              <span>
                                {t.alerte(alerte.niveau, formatDate(alerte.declencheeLe))}
                              </span>
                              {data.traitable ? (
                                <TraiterAlerte alerteId={alerte.id} apprenant={nom} />
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
