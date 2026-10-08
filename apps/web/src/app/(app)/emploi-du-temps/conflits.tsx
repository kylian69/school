'use client';

import type { ConflitSeance } from '@scolaly/contracts';
import { Badge } from '@scolaly/ui';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { chiffre } from '../formations/envoi';

const t = fr.edt;

/** Noms des ressources, pour expliquer un conflit en clair. */
export interface Noms {
  seance: (id: string) => string | null;
  intervenant: (id: string) => string | null;
  groupe: (id: string) => string | null;
}

/** RG-04-05 : un conflit ou un avertissement, expliqué en français clair. */
export function texteConflit(conflit: ConflitSeance, noms: Noms): string {
  switch (conflit.code) {
    case 'salle-occupee':
      return t.conflits['salle-occupee'](noms.seance(conflit.seanceId));
    case 'intervenant-occupe':
      return t.conflits['intervenant-occupe'](
        conflit.intervenantIds
          .map((id) => noms.intervenant(id) ?? t.conflits.unIntervenant)
          .join(', ') || t.conflits.unIntervenant,
        noms.seance(conflit.seanceId),
      );
    case 'groupe-occupe':
      return t.conflits['groupe-occupe'](
        conflit.groupeIds.map((id) => noms.groupe(id) ?? t.conflits.laPromotion).join(', '),
        conflit.apprenantIds.length,
        noms.seance(conflit.seanceId),
      );
    case 'jour-ferme':
      return t.conflits['jour-ferme'](conflit.jours.map(formatDate).join(', '));
    case 'jour-entreprise':
      return t.conflits['jour-entreprise'](conflit.apprenants.length, conflit.effectif);
    case 'capacite-salle':
      return t.conflits['capacite-salle'](conflit.capacite, conflit.effectif);
    case 'intervenant-indisponible':
      return t.conflits['intervenant-indisponible'](
        noms.intervenant(conflit.intervenantId) ?? t.conflits.unIntervenant,
        conflit.raison === 'hors-disponibilites',
      );
    case 'volume-module':
      return t.conflits['volume-module'](
        noms.groupe(conflit.groupeId) ?? t.conflits.laPromotion,
        chiffre(conflit.planifieMinutes / 60),
        chiffre(conflit.prevuMinutes / 60),
      );
  }
}

/** Clé d'un conflit forçable (RG-04-06) : son code et l'autre séance. */
export const cleForcage = (code: string, seanceId: string) => `${code}:${seanceId}`;

export function ListeConflits({
  conflits,
  noms,
  forces = new Set(),
  titre,
}: {
  conflits: readonly ConflitSeance[];
  noms: Noms;
  /** Conflits déjà forcés, affichés comme tels. */
  forces?: ReadonlySet<string>;
  titre: string;
}) {
  return (
    <ul aria-label={titre} className="flex flex-col gap-2">
      {conflits.map((c, rang) => {
        const force = 'seanceId' in c && forces.has(cleForcage(c.code, c.seanceId));
        return (
          <li
            key={`${c.code}-${String(rang)}`}
            className={`flex flex-col gap-1 rounded-control border px-3 py-2 text-sm ${
              c.niveau === 'bloquant' && !force
                ? 'border-bad/40 bg-bad-soft'
                : 'border-warn/40 bg-warn-soft'
            }`}
          >
            <Badge tone={c.niveau === 'bloquant' && !force ? 'bad' : 'warn'} className="self-start">
              {c.niveau === 'bloquant' ? t.conflits.bloquant : t.conflits.avertissement}
            </Badge>
            <span>{texteConflit(c, noms)}</span>
          </li>
        );
      })}
    </ul>
  );
}
