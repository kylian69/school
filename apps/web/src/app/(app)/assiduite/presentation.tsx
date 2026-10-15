import type { Absence, DecompteAssiduite, StatutJustificatif } from '@scolaly/contracts';
import { Badge } from '@scolaly/ui';
import { fr } from '@/i18n/fr';

const t = fr.assiduite;

/** RG-06-18 : demi-journée touchée par une absence (les deux : une journée). */
export const demiJournee = (a: Pick<Absence, 'matin' | 'apresMidi'>) =>
  a.matin && a.apresMidi ? t.journee : a.matin ? t.matin : t.apresMidi;

export function BadgesAbsence({ absence }: { absence: Pick<Absence, 'nature' | 'statut'> }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={absence.nature === 'absence' ? 'bad' : 'warn'}>{t.nature[absence.nature]}</Badge>
      <Badge tone={absence.statut === 'justifiee' ? 'ok' : 'neutral'}>
        {t.statut[absence.statut]}
      </Badge>
    </span>
  );
}

const TONS_JUSTIFICATIF = {
  'a-traiter': 'accent',
  'complement-demande': 'warn',
  accepte: 'ok',
  refuse: 'bad',
} as const;

/** RG-06-21 : statut d'un justificatif. */
export function BadgeJustificatif({ statut }: { statut: StatutJustificatif }) {
  return <Badge tone={TONS_JUSTIFICATIF[statut]}>{fr.justificatifs.statut[statut]}</Badge>;
}

/** RG-06-18 : décompte en heures et en demi-journées (E-06-04, E-06-07). */
export function Decompte({ decompte }: { decompte: DecompteAssiduite }) {
  const chiffres = [
    [t.demiJournees, String(decompte.demiJournees)],
    [t.demiJourneesNonJustifiees, String(decompte.demiJourneesNonJustifiees)],
    [t.heuresAbsence, t.duree(decompte.minutesAbsence)],
    [t.absences, String(decompte.absences)],
    [t.retards, String(decompte.retards)],
    [t.heuresRetard, t.duree(decompte.minutesRetard)],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {chiffres.map(([libelle, valeur]) => (
        <div key={libelle} className="flex flex-col gap-0.5 rounded-lg border border-line p-3">
          <dt className="text-xs text-muted">{libelle}</dt>
          <dd className="text-xl font-semibold">{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}
