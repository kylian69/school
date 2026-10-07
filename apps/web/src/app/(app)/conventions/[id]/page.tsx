import { ConventionStage, JournalAudit } from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListeEvenements } from '@/components/journal/liste-evenements';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { alertesConvention, euros, TONS_CONVENTION } from '../../contrats/alertes';
import { DocumentSigne } from '../../contrats/[id]/document-signe';
import { ActionsConvention } from './actions-convention';

const t = fr.contrats;
export const metadata: Metadata = { title: 'Convention de stage' };

/** E-03-04 · Convention de stage : données, contrôles légaux, PDF signé, statut, historique. */
export default async function FicheConventionPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('contrats:lire') && !permissions.includes('contrats:gerer')) notFound();
  const { id } = await params;
  const [{ data: c }, { data: historique }] = await Promise.all([
    apiGet(`/api/conventions-stage/${id}`, ConventionStage),
    permissions.includes('audit:lire')
      ? apiGet(`/api/audit?objet=${id}&parPage=20`, JournalAudit)
      : Promise.resolve({ data: null }),
  ]);
  if (!c) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {t.fiche.introuvableConvention}
        </p>
      </Card>
    );
  }
  const nom = `${c.apprenant.prenom} ${c.apprenant.nom}`;
  const alertes = alertesConvention(c);
  const lignes: [string, string][] = [
    [t.colonnes.entreprise, c.entreprise.raisonSociale],
    [t.colonnes.periode, t.periode(formatDate(c.debut), formatDate(c.fin))],
    [t.fiche.heures, new Intl.NumberFormat('fr-FR').format(c.heuresPresence)],
    [
      t.fiche.gratification,
      c.gratificationHoraire === null ? t.fiche.sansGratification : euros(c.gratificationHoraire),
    ],
    [t.fiche.tuteur, c.tuteur ? `${c.tuteur.prenom} ${c.tuteur.nom}` : '—'],
    [t.fiche.referent, `${c.referent.prenom} ${c.referent.nom}`],
    [t.fiche.missions, c.missions ?? '—'],
    [t.fiche.derogation, c.derogationMotif ?? '—'],
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
          <Badge>{t.fiche.convention}</Badge>
          <Badge tone={TONS_CONVENTION[c.statut]}>{t.statutsConvention[c.statut]}</Badge>
          <span className="text-sm text-muted">{c.apprenant.promotion.libelle}</span>
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
              <dd className="whitespace-pre-line">{valeur}</dd>
            </div>
          ))}
        </dl>
        {c.modifiable ? <ActionsConvention convention={c} /> : null}
      </Card>
      <DocumentSigne
        url={`/api/conventions-stage/${c.id}/document`}
        present={c.document}
        modifiable={c.modifiable}
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
