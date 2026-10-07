import { ListeEntreprises, ListeOpcos } from '@scolaly/contracts';
import { Badge, Button, Card, Input, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { SELECT } from '../formations/envoi';
import { NouvelleEntreprise } from './nouvelle-entreprise';

const t = fr.entreprises;
export const metadata: Metadata = { title: t.titre };

/** E-03-01 · Entreprises : liste filtrable, création par SIRET (US-03-01). */
export default async function EntreprisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; opco?: string; ville?: string }>;
}) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('entreprises:lire') && !permissions.includes('entreprises:gerer'))
    notFound();
  const filtres = await searchParams;
  const requete = new URLSearchParams(
    Object.entries(filtres).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    ),
  );
  const [{ data }, { data: opcos }] = await Promise.all([
    apiGet(`/api/entreprises?${requete.toString()}`, ListeEntreprises),
    apiGet('/api/opcos', ListeOpcos),
  ]);
  const libelleOpco = (code: string | null) =>
    opcos?.opcos.find((o) => o.code === code)?.libelle ?? code ?? '—';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        {data?.creation ? <NouvelleEntreprise opcos={opcos?.opcos ?? []} /> : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/entreprises" method="get">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="filtre-q">{t.rechercher}</Label>
          <Input id="filtre-q" name="q" defaultValue={filtres.q} maxLength={100} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="filtre-opco">{t.opco}</Label>
          <select id="filtre-opco" name="opco" defaultValue={filtres.opco ?? ''} className={SELECT}>
            <option value="">{t.tousOpco}</option>
            {(opcos?.opcos ?? []).map((o) => (
              <option key={o.code} value={o.code}>
                {o.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="filtre-ville">{t.ville}</Label>
          <Input id="filtre-ville" name="ville" defaultValue={filtres.ville} maxLength={80} />
        </div>
        <Button type="submit" variant="secondary">
          {t.filtrer}
        </Button>
      </form>

      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : data.entreprises.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.colonnes.raisonSociale}
                </th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                  {t.colonnes.siret}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.colonnes.ville}
                </th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                  {t.colonnes.opco}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t.colonnes.tuteurs}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entreprises.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/entreprises/${e.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {e.raisonSociale}
                      </Link>
                      {e.statut === 'fermee' ? <Badge tone="bad">{t.fermee}</Badge> : null}
                      {e.aVerifier ? <Badge tone="warn">{t.aVerifier}</Badge> : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums md:table-cell">{e.siret}</td>
                  <td className="px-4 py-3">{e.ville ?? '—'}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{libelleOpco(e.opco)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.tuteurs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
