import { NatureAbsence, StatutAbsence, SuiviAssiduite } from '@scolaly/contracts';
import { Badge, Button, Card, Input, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate, formatHeure } from '@/lib/format';
import { SELECT } from '../formations/envoi';
import { FeuillesPromotion } from './feuilles';
import { BadgesAbsence, Decompte, demiJournee } from './presentation';

const t = fr.assiduite;
export const metadata: Metadata = { title: t.titre };

const FILTRES = ['promotionId', 'du', 'au', 'nature', 'statut'] as const;
type Filtres = Partial<Record<(typeof FILTRES)[number], string>>;

/**
 * E-06-07 · Suivi de l'assiduité (premier lot, I4.4) : retards et absences des apprenants du
 * périmètre, filtrables par promotion, période, nature et statut, avec le décompte par apprenant.
 */
export default async function AssiduitePage({ searchParams }: { searchParams: Promise<Filtres> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('assiduite:lire')) notFound();
  const filtres = await searchParams;
  const params = new URLSearchParams(
    FILTRES.flatMap((nom) => (filtres[nom] ? [[nom, filtres[nom]] as [string, string]] : [])),
  );
  const { data } = await apiGet(`/api/assiduite?${params.toString()}`, SuiviAssiduite);
  const filtre = params.size > 0;
  const choix = [
    ['promotionId', t.promotion, (data?.promotions ?? []).map((p) => [p.id, p.libelle]), t.toutes],
    ['nature', t.natureFiltre, NatureAbsence.options.map((n) => [n, t.nature[n] ?? n]), t.toutes],
    ['statut', t.statutFiltre, StatutAbsence.options.map((s) => [s, t.statut[s] ?? s]), t.tous],
  ] as const;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="text-sm text-muted">{t.aide}</p>
      </div>

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        action="/assiduite"
        method="get"
      >
        {choix.map(([nom, libelle, options, vide]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={`filtre-${nom}`}>{libelle}</Label>
            <select
              id={`filtre-${nom}`}
              name={nom}
              defaultValue={filtres[nom] ?? ''}
              className={SELECT}
            >
              <option value="">{vide}</option>
              {options.map(([valeur, texte]) => (
                <option key={valeur} value={valeur}>
                  {texte}
                </option>
              ))}
            </select>
          </div>
        ))}
        {(['du', 'au'] as const).map((nom) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={`filtre-${nom}`}>{t[nom]}</Label>
            <Input id={`filtre-${nom}`} name={nom} type="date" defaultValue={filtres[nom] ?? ''} />
          </div>
        ))}
        <Button type="submit" variant="secondary">
          {t.filtrer}
        </Button>
      </form>

      {permissions.includes('emargement:feuilles') && data && data.promotions.length > 0 ? (
        <section aria-labelledby="feuilles" className="flex flex-col gap-3">
          <h2 id="feuilles" className="text-lg font-semibold">
            {fr.feuilles.titre}
          </h2>
          <p className="text-sm text-muted">{fr.feuilles.aide}</p>
          <FeuillesPromotion promotions={data.promotions} />
        </section>
      ) : null}

      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : data.absences.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{filtre ? t.aucuneFiltre : t.aucune}</p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="par-apprenant" className="flex flex-col gap-3">
            <h2 id="par-apprenant" className="text-lg font-semibold">
              {t.parApprenant}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {data.apprenants.map((a) => (
                <li key={a.personneId}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{`${a.prenom} ${a.nom}`}</h3>
                      <span className="flex gap-1">
                        {a.promotion ? <Badge>{a.promotion}</Badge> : null}
                        {a.alternant ? <Badge tone="accent">{t.alternantBadge}</Badge> : null}
                      </span>
                    </div>
                    <Decompte decompte={a.decompte} />
                  </Card>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="detail" className="flex flex-col gap-3">
            <h2 id="detail" className="text-lg font-semibold">
              {t.detail}
            </h2>
            {data.tronque ? (
              <p className="text-sm text-muted">{t.tronque(data.absences.length)}</p>
            ) : null}
            <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label={t.tableau}>
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    {[t.date, t.apprenant, t.seance, t.demiJournee, t.absences].map((c) => (
                      <th key={c} scope="col" className="px-3 py-2 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.absences.map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.jour)}</td>
                      <td className="px-3 py-2">{`${a.prenom} ${a.nom}`}</td>
                      <td className="px-3 py-2">
                        {a.libelle}
                        <span className="block text-muted">
                          {`${formatHeure(a.debut)} – ${formatHeure(a.fin)}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">{demiJournee(a)}</td>
                      <td className="px-3 py-2">
                        <BadgesAbsence absence={a} />
                        <span className="text-muted">{t.duree(a.minutes)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
