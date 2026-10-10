import { SeanceProche } from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatHeure } from '@/lib/format';

const t = fr.emargement;
export const metadata: Metadata = { title: t.seances };

/** US-06-01 · Séances du jour de l'intervenant, d'où il ouvre l'appel. */
export default async function SeancesPage() {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('emargement:animer')) notFound();
  const { data } = await apiGet('/api/seances', z.array(SeanceProche));
  const seances = data ?? [];
  const maintenant = new Date().getTime();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.seances}</h1>
        <p className="text-sm text-muted">{t.seancesAide}</p>
      </div>
      {seances.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.aucuneSeance}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {seances.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    {s.libelle}
                    {Date.parse(s.fin) < maintenant ? (
                      <Badge tone="neutral">{t.terminee}</Badge>
                    ) : Date.parse(s.debut) <= maintenant ? (
                      <Badge tone="ok">{t.enCours}</Badge>
                    ) : null}
                    {s.modifiee ? (
                      <Badge tone="warn" title={t.modifieeAide}>
                        {t.modifiee}
                      </Badge>
                    ) : null}
                  </h2>
                  <p className="text-sm text-muted">
                    {t.horaire(formatHeure(s.debut), formatHeure(s.fin))}
                    {s.distanciel ? ` · ${t.distanciel}` : ''}
                    {s.intervenant ? ` · ${s.intervenant}` : ''}
                  </p>
                </div>
                <Button asChild>
                  <Link href={`/seances/${s.id}/appel`}>{t.ouvrirAppel}</Link>
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
