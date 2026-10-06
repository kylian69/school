import { JournalAudit } from '@scolaly/contracts';
import { Button, Card, Input, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListeEvenements } from '@/components/journal/liste-evenements';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';

const t = fr.journal;
export const metadata: Metadata = { title: t.titre };

/** E-01-08 · Journal d'audit : fil chronologique filtrable, détail avant et après, export. */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; du?: string; au?: string; curseur?: string }>;
}) {
  if (!(await getContexte())?.permissions.includes('audit:lire')) notFound();
  const { action = '', du = '', au = '', curseur = '' } = await searchParams;
  const filtres = new URLSearchParams({
    ...(action ? { action } : {}),
    ...(du ? { du } : {}),
    ...(au ? { au } : {}),
  });
  const page = new URLSearchParams(filtres);
  if (curseur) page.set('curseur', curseur);
  const { data } = await apiGet(`/api/audit?${page.toString()}`, JournalAudit);
  const suivante = new URLSearchParams(filtres);
  if (data?.suivant) suivante.set('curseur', data.suivant);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="max-w-2xl text-sm text-muted">{t.aide}</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" action="/parametres/journal" method="get">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-action">{t.action}</Label>
          <select
            id="journal-action"
            name="action"
            defaultValue={action}
            className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
          >
            <option value="">{t.toutes}</option>
            {Object.entries(t.familles).map(([prefixe, libelle]) => (
              <option key={prefixe} value={prefixe}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-du">{t.du}</Label>
          <Input id="journal-du" name="du" type="date" defaultValue={du} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-au">{t.au}</Label>
          <Input id="journal-au" name="au" type="date" defaultValue={au} />
        </div>
        <Button type="submit" variant="secondary">
          {t.filtrer}
        </Button>
        <a
          href={`/api/audit/export?${filtres.toString()}`}
          download
          className="ml-auto text-sm font-medium text-accent underline"
        >
          {t.exporter}
        </a>
      </form>
      <Card>
        {data ? (
          <ListeEvenements evenements={data.evenements} />
        ) : (
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        )}
      </Card>
      {data?.suivant ? (
        <Link
          href={`/parametres/journal?${suivante.toString()}`}
          className="self-start text-sm font-medium text-accent underline"
        >
          {t.plusAnciens}
        </Link>
      ) : null}
    </>
  );
}
