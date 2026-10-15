import {
  FileJustificatifs,
  LIMITE_FILE_JUSTIFICATIFS,
  MotifJustificatif,
  StatutJustificatif,
} from '@scolaly/contracts';
import { Badge, Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate, formatHeure } from '@/lib/format';
import { SELECT } from '../../formations/envoi';
import { BadgeJustificatif } from '../presentation';
import { Traitement } from './traitement';

const t = fr.justificatifs;
export const metadata: Metadata = { title: t.titre };

const FILTRES = ['statut', 'promotionId', 'motif'] as const;
type Filtres = Partial<Record<(typeof FILTRES)[number], string>>;

/**
 * E-06-06 · File des justificatifs (US-06-08) : justificatifs du périmètre, filtrables par
 * statut (à traiter par défaut), promotion et motif, avec le document et la décision.
 */
export default async function JustificatifsPage({
  searchParams,
}: {
  searchParams: Promise<Filtres>;
}) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('justificatifs:traiter')) notFound();
  const filtres = await searchParams;
  const params = new URLSearchParams(
    FILTRES.flatMap((nom) => (filtres[nom] ? [[nom, filtres[nom]] as [string, string]] : [])),
  );
  const { data } = await apiGet(`/api/justificatifs?${params.toString()}`, FileJustificatifs);
  const choix = [
    [
      'statut',
      t.statutFiltre,
      StatutJustificatif.options.filter((s) => s !== 'a-traiter').map((s) => [s, t.statut[s] ?? s]),
      t.statut['a-traiter'],
    ],
    ['promotionId', t.promotion, (data?.promotions ?? []).map((p) => [p.id, p.libelle]), t.toutes],
    ['motif', t.motifFiltre, MotifJustificatif.options.map((m) => [m, t.motif[m] ?? m]), t.tous],
  ] as const;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="text-sm text-muted">{t.aide}</p>
      </div>

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        action="/assiduite/justificatifs"
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
          {t.filtrer}
        </Button>
      </form>

      <section aria-labelledby="file" className="flex flex-col gap-3">
        <h2 id="file" className="text-lg font-semibold">
          {t.file}
        </h2>
        {!data ? (
          <Card>
            <p role="alert" className="text-sm">
              {fr.assiduite.indisponible}
            </p>
          </Card>
        ) : data.justificatifs.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t.aucunATraiter}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.justificatifs.map((j) => (
              <li key={j.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">
                      {j.prenom} {j.nom}
                      {j.promotion ? (
                        <span className="font-normal text-muted"> · {j.promotion}</span>
                      ) : null}
                    </h3>
                    <span className="flex flex-wrap gap-1">
                      <BadgeJustificatif statut={j.statut} />
                      {j.horsDelai ? <Badge tone="warn">{t.horsDelai}</Badge> : null}
                      {j.deposeParEcole ? <Badge>{t.parEcole}</Badge> : null}
                    </span>
                  </div>
                  <p className="text-sm">
                    {t.motif[j.motif]} · {t.deposeLe(formatDate(j.deposeLe))}
                    {j.document ? '' : ` · ${t.sansDocument}`}
                  </p>
                  {j.precision ? <p className="text-sm text-muted">« {j.precision} »</p> : null}
                  <ul className="flex flex-col gap-0.5 text-sm" aria-label={t.absencesConcernees}>
                    {j.absences.map((a) => (
                      <li key={a.id}>
                        {a.libelle} · {formatDate(a.debut)} · {formatHeure(a.debut)} –{' '}
                        {formatHeure(a.fin)} · {fr.assiduite.nature[a.nature]}
                      </li>
                    ))}
                  </ul>
                  {j.message ? (
                    <p className="text-sm">
                      <span className="text-muted">{t.messageEcole} : </span>
                      {j.message}
                    </p>
                  ) : null}
                  <Traitement
                    justificatifId={j.id}
                    document={j.document}
                    ouvert={j.statut === 'a-traiter' || j.statut === 'complement-demande'}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
        {data?.tronque ? (
          <p className="text-sm text-muted">{t.tronque(LIMITE_FILE_JUSTIFICATIFS)}</p>
        ) : null}
      </section>
    </>
  );
}
