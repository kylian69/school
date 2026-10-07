import { ListeContrats, STATUTS_CONTRAT, TYPES_CONTRAT } from '@scolaly/contracts';
import { Badge, Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { SELECT } from '../formations/envoi';
import { alertesContrat, alertesConvention, TONS_CONTRAT, TONS_CONVENTION } from './alertes';

const t = fr.contrats;
export const metadata: Metadata = { title: t.titre };

const TH = 'px-4 py-3 font-medium';

/** E-03-03 · Contrats et stages : tableau par type et statut, avec leurs alertes. */
export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; statut?: string }>;
}) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('contrats:lire') && !permissions.includes('contrats:gerer')) notFound();
  const { type, statut } = await searchParams;
  const { data } = await apiGet('/api/contrats', ListeContrats);
  const contrats = (data?.contrats ?? []).filter(
    (c) => (!type || c.type === type) && (!statut || c.statut === statut),
  );

  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="titre-contrats" className="flex flex-col gap-3">
            <h2 id="titre-contrats" className="text-lg font-semibold">
              {t.contrats}
            </h2>
            <form className="flex flex-wrap items-end gap-3" action="/contrats" method="get">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="filtre-type">{t.type}</Label>
                <select id="filtre-type" name="type" defaultValue={type ?? ''} className={SELECT}>
                  <option value="">{t.tousTypes}</option>
                  {TYPES_CONTRAT.map((x) => (
                    <option key={x} value={x}>
                      {t.types[x]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="filtre-statut">{t.statut}</Label>
                <select
                  id="filtre-statut"
                  name="statut"
                  defaultValue={statut ?? ''}
                  className={SELECT}
                >
                  <option value="">{t.tousStatuts}</option>
                  {STATUTS_CONTRAT.map((x) => (
                    <option key={x} value={x}>
                      {t.statuts[x]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="secondary">
                {t.filtrer}
              </Button>
            </form>
            {contrats.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">{t.aucunContrat}</p>
              </Card>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className={TH}>
                        {t.colonnes.apprenant}
                      </th>
                      <th scope="col" className={`hidden md:table-cell ${TH}`}>
                        {t.colonnes.entreprise}
                      </th>
                      <th scope="col" className={`hidden md:table-cell ${TH}`}>
                        {t.colonnes.periode}
                      </th>
                      <th scope="col" className={TH}>
                        {t.colonnes.statut}
                      </th>
                      <th scope="col" className={`hidden md:table-cell ${TH}`}>
                        {t.colonnes.alertes}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrats.map((c) => (
                      <tr key={c.id} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/contrats/${c.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {`${c.apprenant.prenom} ${c.apprenant.nom}`}
                          </Link>
                          <p className="text-xs text-muted">{`${t.types[c.type]} · ${c.apprenant.promotion.libelle}`}</p>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          {c.entreprise.raisonSociale}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          {t.periode(formatDate(c.debut), formatDate(c.fin))}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={TONS_CONTRAT[c.statut]}>{t.statuts[c.statut]}</Badge>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <ul className="flex flex-col gap-1 text-xs text-warn">
                            {alertesContrat(c).map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <section aria-labelledby="titre-conventions" className="flex flex-col gap-3">
            <h2 id="titre-conventions" className="text-lg font-semibold">
              {t.conventions}
            </h2>
            {data.conventions.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">{t.aucuneConvention}</p>
              </Card>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {data.conventions.map((c) => (
                  <li key={c.id}>
                    <Card className="flex h-full flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/conventions/${c.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {`${c.apprenant.prenom} ${c.apprenant.nom}`}
                        </Link>
                        <Badge tone={TONS_CONVENTION[c.statut]}>
                          {t.statutsConvention[c.statut]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted">
                        {`${c.entreprise.raisonSociale} · ${t.periode(formatDate(c.debut), formatDate(c.fin))}`}
                      </p>
                      <ul className="flex flex-col gap-1 text-xs text-warn">
                        {alertesConvention(c).map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
