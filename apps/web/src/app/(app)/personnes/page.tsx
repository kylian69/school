import { ETATS_COMPTE, ListePersonnes, ListeRoles } from '@scolaly/contracts';
import { Button, Card, Input, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { TableauPersonnes } from './tableau-personnes';

const t = fr.personnes;
export const metadata: Metadata = { title: t.titre };

/** E-01-04 · Personnes : tableau filtrable, pagination côté serveur. */
export default async function PersonnesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; etat?: string; page?: string }>;
}) {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!permissions.includes('personnes:lire')) notFound();
  const { q = '', role = '', etat = '', page = '1' } = await searchParams;
  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
    ...(etat ? { etat } : {}),
    page,
  });
  const [{ data }, { data: roles }] = await Promise.all([
    apiGet(`/api/personnes?${params.toString()}`, ListePersonnes),
    apiGet('/api/roles', ListeRoles),
  ]);
  const peutCreer =
    permissions.includes('apprenants:inviter') || permissions.includes('personnel:inviter');
  const filtresExport = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
    ...(etat ? { etat } : {}),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  const lien = (cible: number) => {
    const suivant = new URLSearchParams(params);
    suivant.set('page', String(cible));
    return `/personnes?${suivant.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
          {data ? <p className="text-sm text-muted">{t.resume(data.total)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {peutCreer ? (
            <Button variant="secondary" asChild>
              <Link href="/personnes/photos">{fr.photo.import.lien}</Link>
            </Button>
          ) : null}
          {permissions.includes('personnes:importer') ? (
            <Button variant="secondary" asChild>
              <Link href="/personnes/import">{fr.imports.importer}</Link>
            </Button>
          ) : null}
          {peutCreer ? (
            <Button asChild>
              <Link href="/personnes/nouvelle">{t.nouvelle}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        action="/personnes"
        method="get"
      >
        <div className="flex min-w-60 grow flex-col gap-1.5">
          <Label htmlFor="recherche-personnes">{t.rechercher}</Label>
          <Input id="recherche-personnes" name="q" type="search" defaultValue={q} />
        </div>
        {roles ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtre-role">{t.role}</Label>
            <select
              id="filtre-role"
              name="role"
              defaultValue={role}
              className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
            >
              <option value="">{t.tousLesRoles}</option>
              {roles.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.libelle}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtre-etat">{t.etat}</Label>
          <select
            id="filtre-etat"
            name="etat"
            defaultValue={etat}
            className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
          >
            <option value="">{t.tousLesEtats}</option>
            {ETATS_COMPTE.map((e) => (
              <option key={e} value={e}>
                {t.etats[e]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t.filtrer}
        </Button>
      </form>

      {data ? (
        <TableauPersonnes
          personnes={data.personnes}
          filtres={filtresExport.toString()}
          droits={{
            inviter: peutCreer,
            desactiver: permissions.includes('comptes:desactiver'),
            exporter: permissions.includes('personnes:exporter'),
          }}
        />
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      )}

      {data && pages > 1 ? (
        <nav aria-label={t.pagination} className="flex items-center gap-3 text-sm">
          {data.page > 1 ? (
            <Link href={lien(data.page - 1)} className="font-medium hover:underline">
              {t.precedente}
            </Link>
          ) : null}
          <span className="text-muted">{t.pageSur(data.page, pages)}</span>
          {data.page < pages ? (
            <Link href={lien(data.page + 1)} className="font-medium hover:underline">
              {t.suivante}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
