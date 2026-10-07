import { Contrat, Entreprise, JournalAudit, ListeOpcos } from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListeEvenements } from '@/components/journal/liste-evenements';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { alertesContrat, TONS_CONTRAT } from '../alertes';
import { ActionsContrat } from './actions-contrat';
import { DocumentSigne } from './document-signe';
import { TuteursContrat } from './tuteurs-contrat';

const t = fr.contrats;
export const metadata: Metadata = { title: 'Fiche contrat' };

/** E-03-04 · Fiche contrat : données, tuteurs, PDF signé, statut, rupture et historique. */
export default async function FicheContratPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('contrats:lire') && !permissions.includes('contrats:gerer')) notFound();
  const { id } = await params;
  const { data: contrat } = await apiGet(`/api/contrats/${id}`, Contrat);
  if (!contrat) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {t.fiche.introuvable}
        </p>
      </Card>
    );
  }
  const [{ data: entreprise }, { data: opcos }, { data: historique }] = await Promise.all([
    contrat.modifiable && permissions.includes('entreprises:lire')
      ? apiGet(`/api/entreprises/${contrat.entreprise.id}`, Entreprise)
      : Promise.resolve({ data: null }),
    apiGet('/api/opcos', ListeOpcos),
    permissions.includes('audit:lire')
      ? apiGet(`/api/audit?objet=${id}&parPage=20`, JournalAudit)
      : Promise.resolve({ data: null }),
  ]);
  const nom = `${contrat.apprenant.prenom} ${contrat.apprenant.nom}`;
  const alertes = alertesContrat(contrat);
  const lignes: [string, string][] = [
    [t.colonnes.entreprise, contrat.entreprise.raisonSociale],
    [t.colonnes.periode, t.periode(formatDate(contrat.debut), formatDate(contrat.fin))],
    [
      t.fiche.opco,
      opcos?.opcos.find((o) => o.code === contrat.opco)?.libelle ?? contrat.opco ?? '—',
    ],
    [t.fiche.numeroDepot, contrat.numeroDepot ?? '—'],
    [
      t.fiche.referent,
      contrat.referent ? `${contrat.referent.prenom} ${contrat.referent.nom}` : '—',
    ],
    [t.fiche.prolongee, contrat.formationProlongee ? t.fiche.oui : t.fiche.non],
  ];

  return (
    <>
      <nav aria-label="Fil d’Ariane" className="text-sm text-muted">
        <Link href="/contrats" className="hover:underline">
          {t.titre}
        </Link>{' '}
        / {nom}
      </nav>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{nom}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t.fiche.contrat(t.types[contrat.type])}</Badge>
          <Badge tone={TONS_CONTRAT[contrat.statut]}>{t.statuts[contrat.statut]}</Badge>
          <span className="text-sm text-muted">{contrat.apprenant.promotion.libelle}</span>
        </div>
      </div>
      {alertes.length > 0 ? (
        <Card className="max-w-3xl" role="status">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {alertes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card className="flex max-w-3xl flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.fiche.donnees}</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {lignes.map(([libelle, valeur]) => (
            <div key={libelle} className="flex flex-col gap-0.5">
              <dt className="text-muted">{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
        {contrat.rupture ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium text-bad">
              {t.fiche.rupture(formatDate(contrat.rupture.date), t.motifs[contrat.rupture.motif])}
            </p>
            {contrat.rupture.sansEmployeurJusquau ? (
              <p>{t.fiche.sansEmployeur(formatDate(contrat.rupture.sansEmployeurJusquau))}</p>
            ) : null}
          </div>
        ) : null}
        {contrat.modifiable ? <ActionsContrat contrat={contrat} /> : null}
      </Card>
      <TuteursContrat
        contrat={contrat}
        tuteursEntreprise={(entreprise?.contacts ?? []).filter((c) => c.type === 'tuteur')}
        inviter={
          permissions.includes('apprenants:inviter') || permissions.includes('personnel:inviter')
        }
      />
      <DocumentSigne
        url={`/api/contrats/${contrat.id}/document`}
        present={contrat.document}
        modifiable={contrat.modifiable}
      />
      {historique ? (
        <Card className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.fiche.historique}</h2>
          <ListeEvenements evenements={historique.evenements} />
        </Card>
      ) : null}
    </>
  );
}
