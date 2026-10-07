import {
  ListeFormations,
  MODES_FORMATION,
  OrganisationDetail,
  TYPES_FORMATION,
} from '@scolaly/contracts';
import { Badge, Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { SELECT } from './envoi';
import { NouvelleFormation } from './nouvelle-formation';

const t = fr.referentiel;
export const metadata: Metadata = { title: t.titre };

const PERMISSIONS = ['referentiel:lire', 'referentiel:gerer', 'referentiel:publier'];
const TONS = { brouillon: 'warn', publiee: 'ok', archivee: 'neutral' } as const;

/** E-02-01 · Catalogue des formations : liste filtrable (type, niveau, mode, établissement). */
export default async function FormationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    niveau?: string;
    mode?: string;
    etablissementId?: string;
  }>;
}) {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!PERMISSIONS.some((p) => permissions.includes(p))) notFound();
  const filtres = await searchParams;
  const params = new URLSearchParams(
    Object.entries(filtres).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const [{ data }, { data: organisation }] = await Promise.all([
    apiGet(`/api/formations?${params.toString()}`, ListeFormations),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  const etablissements = (organisation?.etablissements ?? []).filter((e) => e.statut === 'actif');
  const nomEtablissement = (id: string) => etablissements.find((e) => e.id === id)?.nom;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
          {data ? <p className="text-sm text-muted">{t.resume(data.formations.length)}</p> : null}
        </div>
        {data?.creation ? <NouvelleFormation etablissements={etablissements} /> : null}
      </div>

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        action="/formations"
        method="get"
      >
        {(
          [
            ['type', t.champs.type, TYPES_FORMATION.map((v) => [v, t.types[v]])],
            ['niveau', t.champs.niveau, [5, 6, 7, 8].map((n) => [String(n), t.niveau(n)])],
            ['mode', t.champs.mode, MODES_FORMATION.map((v) => [v, t.modes[v]])],
            ['etablissementId', t.champs.etablissement, etablissements.map((e) => [e.id, e.nom])],
          ] as const
        ).map(([nom, libelle, options]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={`filtre-${nom}`}>{libelle}</Label>
            <select
              id={`filtre-${nom}`}
              name={nom}
              defaultValue={filtres[nom] ?? ''}
              className={SELECT}
            >
              <option value="">{nom === 'type' || nom === 'niveau' ? t.tous : t.toutes}</option>
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

      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : data.formations.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.formations.map((formation) => {
            const derniere = formation.versions.at(-1);
            return (
              <li key={formation.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold">
                      <Link
                        href={`/formations/${formation.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {formation.intitule}
                      </Link>
                    </h2>
                    <p className="text-sm text-muted">
                      {[
                        t.types[formation.type],
                        t.niveau(formation.niveau),
                        t.duree(formation.dureeAnnees),
                        formation.codeRncp,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formation.statut === 'archivee' ? (
                      <Badge>{t.statutsFormation.archivee}</Badge>
                    ) : null}
                    {formation.modes.map((m) => (
                      <Badge key={m} tone="accent">
                        {t.modes[m]}
                      </Badge>
                    ))}
                    {derniere ? (
                      <Badge tone={TONS[derniere.statut]}>
                        {`${t.version(derniere.numero)} · ${t.statutsVersion[derniere.statut]}`}
                      </Badge>
                    ) : null}
                  </div>
                  {formation.etablissementIds.length > 0 ? (
                    <p className="mt-auto text-sm text-muted">
                      {formation.etablissementIds.map(nomEtablissement).filter(Boolean).join(', ')}
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
