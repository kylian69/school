import { ClientFiche } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccesEcole, EtatClient } from '@/components/console/badges';
import { EtatActions, ModulesClient } from '@/components/console/client-actions';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { formatDate, formatDateHeure, formatNombre } from '@/lib/format';
import { getRolePlateforme } from '@/lib/plateforme';

const t = fr.console;

async function charger(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await apiGet(`/api/plateforme/clients/${id}`, ClientFiche)).data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const client = await charger((await params).id);
  return { title: client?.raisonSociale ?? t.fiche.introuvable };
}

/** E-19-03 · Fiche client : contrat, écoles, modules, historique des états. */
export default async function FicheClientPage({ params }: { params: Promise<{ id: string }> }) {
  const [client, role] = await Promise.all([charger((await params).id), getRolePlateforme()]);
  if (!client) notFound();
  const superAdmin = role === 'super_administrateur';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13.5px] text-muted">
            {client.sousDomaine} · {t.types[client.type]}
          </span>
          <h1 className="flex flex-wrap items-center gap-3 text-[30px] font-[650] tracking-[-0.035em]">
            {client.raisonSociale} <EtatClient etat={client.etat} />
          </h1>
        </div>
        {superAdmin ? <EtatActions client={client} /> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t.fiche.contrat}</h2>
          {client.contrat ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t.nouveau.formule}</dt>
              <dd>{t.formules[client.contrat.formule]}</dd>
              <dt className="text-muted">{t.nouveau.volume}</dt>
              <dd className="num">
                {t.fiche.apprenants(formatNombre(client.contrat.volumeApprenants))}
              </dd>
              <dt className="text-muted">{t.clients.colonnes.echeance}</dt>
              <dd className="num">
                {t.fiche.du(
                  formatDate(client.contrat.dateDebut),
                  formatDate(client.contrat.dateFin),
                )}
              </dd>
              <dt className="text-muted">{t.fiche.devis}</dt>
              <dd>{client.contrat.referenceDevis ?? '—'}</dd>
              <dt className="text-muted">{t.fiche.administrateur}</dt>
              <dd>
                {client.administrateur.nom} · {client.administrateur.email}
              </dd>
              {client.contactFacturation ? (
                <>
                  <dt className="text-muted">{t.fiche.facturation}</dt>
                  <dd>
                    {client.contactFacturation.nom} · {client.contactFacturation.email}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t.fiche.ecoles}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {client.ecoles.map((ecole) => (
              <li key={ecole.id} className="flex items-center justify-between gap-3">
                <span>
                  {ecole.nom} <span className="text-muted">· {ecole.nomAffichage}</span>
                </span>
                <AccesEcole acces={ecole.acces} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t.fiche.modules}</h2>
        <ModulesClient client={client} modifiable={superAdmin} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t.fiche.historique}</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {client.historique.map((evenement) => (
            <li
              key={evenement.survenuLe + evenement.etat}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="num font-mono text-xs text-muted">
                {formatDateHeure(evenement.survenuLe)}
              </span>
              <EtatClient etat={evenement.etat} />
              <span>{evenement.motif}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
