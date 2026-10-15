import { MesAbsences } from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { formatDate, formatHeure } from '@/lib/format';
import { BadgeJustificatif, BadgesAbsence, Decompte, demiJournee } from '../assiduite/presentation';
import { JoindreDocument, Justifier } from './justifier';

const t = fr.assiduite;
const tj = fr.justificatifs;
export const metadata: Metadata = { title: t.mesAbsences };

/**
 * US-06-13, E-06-04 · Mes absences : retards et absences des appels validés, leur décompte, et
 * leurs justificatifs (US-06-07, E-06-05).
 */
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
                        <span className="flex flex-wrap gap-1">
                          <BadgesAbsence absence={a} />
                          {a.justificatif && a.statut !== 'justifiee' ? (
                            <BadgeJustificatif statut={a.justificatif.statut} />
                          ) : null}
                        </span>
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
          <Justifier
            absences={data.absences.filter(
              (a) =>
                a.statut === 'non-justifiee' &&
                (!a.justificatif || a.justificatif.statut === 'refuse'),
            )}
            delaiHeures={data.delaiHeures}
          />
          <section aria-labelledby="justificatifs" className="flex flex-col gap-3">
            <h2 id="justificatifs" className="text-lg font-semibold">
              {tj.mesJustificatifs}
            </h2>
            {data.justificatifs.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">{tj.aucunJustificatif}</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.justificatifs.map((j) => (
                  <li key={j.id}>
                    <Card className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-medium">{tj.motif[j.motif]}</h3>
                        <span className="flex flex-wrap gap-1">
                          <BadgeJustificatif statut={j.statut} />
                          {j.horsDelai ? <Badge tone="warn">{tj.horsDelai}</Badge> : null}
                        </span>
                      </div>
                      <p className="text-sm text-muted">
                        {[
                          tj.deposeLe(formatDate(j.deposeLe)),
                          ...(j.document ? [] : [tj.sansDocument]),
                        ].join(' · ')}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted">{tj.absencesConcernees} : </span>
                        {j.absences.map((a) => `${a.libelle} (${formatDate(a.debut)})`).join(', ')}
                      </p>
                      {j.message ? (
                        <p className="text-sm">
                          <span className="text-muted">{tj.messageEcole} : </span>
                          {j.message}
                        </p>
                      ) : null}
                      {j.statut === 'a-traiter' || j.statut === 'complement-demande' ? (
                        <JoindreDocument justificatifId={j.id} />
                      ) : null}
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
