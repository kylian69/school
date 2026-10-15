import { MesAbsences } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { formatDate, formatHeure } from '@/lib/format';
import { BadgesAbsence, Decompte, demiJournee } from '../assiduite/presentation';

const t = fr.assiduite;
export const metadata: Metadata = { title: t.mesAbsences };

/** US-06-13, E-06-04 · Mes absences : retards et absences des appels validés, et leur décompte. */
export default async function MesAbsencesPage() {
  const { data } = await apiGet('/api/moi/absences', MesAbsences);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {t.mesAbsences}
        </h1>
        <p className="text-sm text-muted">{t.mesAbsencesAide}</p>
      </div>
      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="decompte" className="flex flex-col gap-3">
            <h2 id="decompte" className="text-lg font-semibold">
              {t.decompte}
            </h2>
            <Decompte decompte={data.decompte} />
            {data.alternant ? <p className="text-sm text-muted">{t.alternant}</p> : null}
          </section>
          <section aria-labelledby="detail" className="flex flex-col gap-3">
            <h2 id="detail" className="text-lg font-semibold">
              {t.detail}
            </h2>
            {data.absences.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">{t.aucune}</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.absences.map((a) => (
                  <li key={a.id}>
                    <Card className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-medium">{a.libelle}</h3>
                        <BadgesAbsence absence={a} />
                      </div>
                      <p className="text-sm text-muted">
                        {[
                          formatDate(a.jour),
                          `${formatHeure(a.debut)} – ${formatHeure(a.fin)}`,
                          demiJournee(a),
                          t.duree(a.minutes),
                        ].join(' · ')}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
