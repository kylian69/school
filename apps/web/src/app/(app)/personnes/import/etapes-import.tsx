import { cn } from '@scolaly/ui';
import { fr } from '@/i18n/fr';

const t = fr.imports;

/** Les 4 étapes de l'import (RG-01-18), l'étape courante mise en avant. */
export function EtapesImport({ courante }: { courante: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label={t.titre} className="flex flex-wrap gap-2 text-sm">
      {t.etapes.map((libelle, i) => (
        <li
          key={libelle}
          aria-current={i + 1 === courante ? 'step' : undefined}
          className={cn(
            'rounded-control border px-3 py-1.5',
            i + 1 === courante
              ? 'border-accent bg-accent-soft font-semibold text-accent'
              : 'border-line text-muted',
          )}
        >
          <span className="sr-only">{t.etape(i + 1, libelle)}</span>
          <span aria-hidden="true">
            {i + 1}. {libelle}
          </span>
        </li>
      ))}
    </ol>
  );
}
