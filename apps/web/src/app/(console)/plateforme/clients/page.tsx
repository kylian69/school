import { ETATS_CLIENT, FORMULES, ListeClients } from '@scolaly/contracts';
import { Button, Card, Input, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EtatClient } from '@/components/console/badges';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { formatDate, formatNombre } from '@/lib/format';
import { getRolePlateforme } from '@/lib/plateforme';

const t = fr.console;
export const metadata: Metadata = { title: t.clients.titre };

/** E-19-01 · Clients : liste filtrable (état, formule), recherche, bouton « Nouveau client ». */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etat?: string; formule?: string }>;
}) {
  const filtre = await searchParams;
  const query = new URLSearchParams(
    Object.entries(filtre).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const [{ data }, role] = await Promise.all([
    apiGet(`/api/plateforme/clients?${query.toString()}`, ListeClients),
    getRolePlateforme(),
  ]);
  const clients = data?.clients ?? [];
  const ecoles = clients.reduce((total, c) => total + c.ecoles, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13.5px] text-muted">
            {t.clients.resume(clients.length, ecoles)}
          </span>
          <h1 className="text-[30px] font-[650] tracking-[-0.035em]">{t.clients.titre}</h1>
        </div>
        {role === 'super_administrateur' ? (
          <Button asChild>
            <Link href="/plateforme/clients/nouveau">{t.clients.nouveau}</Link>
          </Button>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="flex min-w-[220px] grow flex-col gap-1.5">
          <Label htmlFor="q">{t.clients.rechercher}</Label>
          <Input id="q" name="q" type="search" defaultValue={filtre.q ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="etat">{t.clients.colonnes.etat}</Label>
          <select
            id="etat"
            name="etat"
            defaultValue={filtre.etat ?? ''}
            className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
          >
            <option value="">{t.clients.tousLesEtats}</option>
            {ETATS_CLIENT.map((etat) => (
              <option key={etat} value={etat}>
                {t.etats[etat]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="formule">{t.clients.colonnes.formule}</Label>
          <select
            id="formule"
            name="formule"
            defaultValue={filtre.formule ?? ''}
            className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
          >
            <option value="">{t.clients.toutesLesFormules}</option>
            {FORMULES.map((formule) => (
              <option key={formule} value={formule}>
                {t.formules[formule]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t.clients.filtrer}
        </Button>
      </form>

      <Card className="overflow-x-auto p-0">
        {data === null ? (
          <p className="p-5 text-sm text-bad">{t.clients.indisponible}</p>
        ) : clients.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.clients.aucun}</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                {Object.values(t.clients.colonnes).map((colonne) => (
                  <th key={colonne} scope="col" className="px-5 py-3 font-medium">
                    {colonne}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-line last:border-0 hover:bg-bg">
                  <td className="px-5 py-3">
                    <Link
                      href={`/plateforme/clients/${client.id}`}
                      className="flex flex-col font-semibold hover:underline"
                    >
                      {client.raisonSociale}
                      <span className="font-mono text-xs font-normal text-muted">
                        {client.sousDomaine} · {t.types[client.type]} · {client.ecoles}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3">{client.formule ? t.formules[client.formule] : '—'}</td>
                  <td className="num px-5 py-3">
                    {client.volumeApprenants === null ? '—' : formatNombre(client.volumeApprenants)}
                  </td>
                  <td className="px-5 py-3">
                    <EtatClient etat={client.etat} />
                  </td>
                  <td className="num px-5 py-3">{formatDate(client.dateFin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
