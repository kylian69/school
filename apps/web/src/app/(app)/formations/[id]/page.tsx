import {
  Formation,
  ListeReglesBibliotheque,
  Maquette,
  OrganisationDetail,
} from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { BarreVersions } from './barre-versions';
import { EditeurCompetences } from './editeur-competences';
import { EditeurMaquette } from './editeur-maquette';
import { EditeurRegles } from './editeur-regles';
import { EnteteFormation } from './entete-formation';

const t = fr.referentiel;
export const metadata: Metadata = { title: t.titre };

const VUES = ['maquette', 'regles', 'competences'] as const;
type Vue = (typeof VUES)[number];

/**
 * Une formation : en-tête, versions de la maquette et trois vues, l'éditeur en arbre (E-02-02),
 * les règles de validation avec le simulateur (E-02-03) et le référentiel de compétences (E-02-09).
 */
export default async function FormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; vue?: string }>;
}) {
  const { id } = await params;
  const { version: demandee, vue: vueDemandee } = await searchParams;
  const [{ data: formation, status }, { data: organisation }] = await Promise.all([
    apiGet(`/api/formations/${id}`, Formation),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  if (status === 404 || status === 403) notFound();
  if (!formation) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {t.indisponible}
        </p>
      </Card>
    );
  }
  // Version demandée, sinon le dernier brouillon, sinon la dernière version publiée.
  const parNumero = [...formation.versions].reverse();
  const version =
    parNumero.find((v) => v.id === demandee) ??
    parNumero.find((v) => v.statut === 'brouillon') ??
    parNumero.find((v) => v.statut === 'publiee') ??
    parNumero[0];
  const vue: Vue = VUES.find((v) => v === vueDemandee) ?? 'maquette';
  const [{ data: maquette }, { data: bibliotheque }] = await Promise.all([
    version ? apiGet(`/api/maquettes/${version.id}`, Maquette) : { data: null },
    vue === 'regles' ? apiGet('/api/referentiel/regles', ListeReglesBibliotheque) : { data: null },
  ]);
  const lien = (cible: Vue) =>
    `/formations/${formation.id}?${new URLSearchParams({ ...(version ? { version: version.id } : {}), vue: cible }).toString()}`;

  return (
    <>
      <EnteteFormation
        formation={formation}
        etablissements={(organisation?.etablissements ?? []).filter((e) => e.statut === 'actif')}
      />
      {maquette ? (
        <>
          <BarreVersions formation={formation} maquette={maquette} vue={vue} />
          <nav aria-label={t.navigationVues} className="flex flex-wrap gap-1 border-b border-line">
            {VUES.map((v) => (
              <Link
                key={v}
                href={lien(v)}
                aria-current={v === vue ? 'page' : undefined}
                className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:font-medium aria-[current=page]:text-fg"
              >
                {t.vues[v]}
              </Link>
            ))}
          </nav>
          {vue === 'maquette' ? <EditeurMaquette maquette={maquette} /> : null}
          {vue === 'regles' ? (
            <EditeurRegles maquette={maquette} bibliotheque={bibliotheque?.regles ?? []} />
          ) : null}
          {vue === 'competences' ? <EditeurCompetences maquette={maquette} /> : null}
        </>
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      )}
    </>
  );
}
