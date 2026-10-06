import type { EvenementAudit } from '@scolaly/contracts';
import Link from 'next/link';
import { fr } from '@/i18n/fr';
import { formatDateHeure } from '@/lib/format';

const t = fr.journal;

const lisible = (valeur: unknown) =>
  valeur === null || valeur === undefined ? '—' : JSON.stringify(valeur, null, 2);

/** Fil chronologique d'événements du journal, avec le détail avant et après (E-01-08). */
export function ListeEvenements({ evenements }: { evenements: readonly EvenementAudit[] }) {
  if (evenements.length === 0) return <p className="text-sm text-muted">{t.aucun}</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {evenements.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <time dateTime={e.survenuLe} className="text-muted tabular-nums">
              {formatDateHeure(e.survenuLe)}
            </time>
            <span className="font-semibold">{t.actions[e.action] ?? e.action}</span>
            <span className="text-muted">{e.auteur?.nom ?? t.systeme}</span>
            {e.objetType === 'personne' && e.objetId ? (
              <Link
                href={`/personnes/${e.objetId}`}
                className="inline-flex min-h-6 items-center text-accent underline"
              >
                {t.voirFiche}
              </Link>
            ) : null}
          </div>
          {e.avant !== null || e.apres !== null ? (
            <details className="text-xs">
              <summary className="inline-flex min-h-6 cursor-pointer items-center text-muted">
                {t.detail}
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="font-semibold">{t.avant}</p>
                  <pre className="overflow-x-auto rounded-control bg-surface-2 p-2 whitespace-pre-wrap">
                    {lisible(e.avant)}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold">{t.apres}</p>
                  <pre className="overflow-x-auto rounded-control bg-surface-2 p-2 whitespace-pre-wrap">
                    {lisible(e.apres)}
                  </pre>
                </div>
              </div>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
