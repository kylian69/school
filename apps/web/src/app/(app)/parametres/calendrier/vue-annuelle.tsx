import type { CalendrierAnnee } from '@scolaly/contracts';
import { cn } from '@scolaly/ui';
import { fr } from '@/i18n/fr';

const t = fr.calendrier;
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Mois couverts par l'année, du mois de début au mois de fin. */
function moisDe(debut: string, fin: string): Date[] {
  const mois: Date[] = [];
  const courant = new Date(`${debut.slice(0, 7)}-01T00:00:00Z`);
  while (iso(courant) <= fin) {
    mois.push(new Date(courant));
    courant.setUTCMonth(courant.getUTCMonth() + 1);
  }
  return mois;
}

/** Semaines d'un mois, du lundi au dimanche ; null pour les cases hors du mois. */
function semainesDe(premier: Date): (string | null)[][] {
  const decalage = (premier.getUTCDay() + 6) % 7;
  const jours = new Date(
    Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cases: (string | null)[] = Array.from({ length: decalage }, () => null);
  for (let j = 1; j <= jours; j++) {
    cases.push(iso(new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth(), j))));
  }
  while (cases.length % 7 !== 0) cases.push(null);
  return Array.from({ length: cases.length / 7 }, (_, s) => cases.slice(s * 7, s * 7 + 7));
}

/** Vue annuelle (E-01-03) : périodes, jours fériés et fermetures en couleur. */
export function VueAnnuelle({ annee }: { annee: CalendrierAnnee }) {
  const feries = new Map(annee.feries.map((f) => [f.date, f.libelle]));
  const fermetureDu = (jour: string) =>
    annee.fermetures.find((f) => f.dateDebut <= jour && jour <= f.dateFin);
  const enPeriode = (jour: string) =>
    annee.periodes.some((p) => p.dateDebut <= jour && jour <= p.dateFin);

  return (
    <section aria-labelledby="titre-vue-annuelle" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titre-vue-annuelle" className="text-lg font-semibold">
          {t.vueAnnuelle}
        </h2>
        <ul aria-label={t.legende.titre} className="flex flex-wrap gap-3 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-warn-soft ring-1 ring-warn" aria-hidden="true" />
            {t.legende.ferie}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-teal-soft ring-1 ring-teal" aria-hidden="true" />
            {t.legende.fermeture}
          </li>
          <li className="flex items-center gap-1.5 text-subtle">
            <span className="size-3 rounded-sm ring-1 ring-line" aria-hidden="true" />
            {t.legende.horsPeriode}
          </li>
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {moisDe(annee.dateDebut, annee.dateFin).map((premier) => (
          <table
            key={iso(premier)}
            className="w-full table-fixed border-separate border-spacing-0.5 rounded-card border border-line bg-surface p-2 text-center text-xs"
          >
            <caption className="pb-1 text-left text-sm font-semibold first-letter:uppercase">
              {MOIS.format(premier)}
            </caption>
            <thead>
              <tr>
                {t.joursSemaine.map((jour, i) => (
                  <th key={jour} scope="col" className="font-medium text-muted">
                    <abbr title={t.joursSemaineLongs[i]} className="no-underline">
                      {jour.slice(0, 2)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semainesDe(premier).map((semaine) => (
                <tr key={semaine.find(Boolean) ?? ''}>
                  {semaine.map((jour, i) => {
                    if (!jour) return <td key={`vide-${String(i)}`} />;
                    const ferie = feries.get(jour);
                    const fermeture = fermetureDu(jour);
                    const dansAnnee = annee.dateDebut <= jour && jour <= annee.dateFin;
                    const note = ferie ?? fermeture?.libelle;
                    return (
                      <td
                        key={jour}
                        title={note}
                        className={cn(
                          'rounded-sm py-1 tabular-nums',
                          ferie
                            ? 'bg-warn-soft font-semibold text-warn'
                            : fermeture
                              ? 'bg-teal-soft font-semibold text-teal'
                              : dansAnnee && enPeriode(jour)
                                ? 'text-fg'
                                : 'text-subtle',
                        )}
                      >
                        {Number(jour.slice(8))}
                        {note ? <span className="sr-only">{`, ${note}`}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
