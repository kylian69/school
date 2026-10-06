'use client';

import type { ElementCorbeille } from '@scolaly/contracts';
import { Badge, Button } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatDate, formatDateHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.corbeille;

/** Liste des éléments de la corbeille, chacun restaurable (RG-01-23). */
export function ElementsCorbeille({ elements }: { elements: readonly ElementCorbeille[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function restaurer(element: ElementCorbeille) {
    const resultat = await envoyer(
      `/api/corbeille/${element.type}/${element.id}/restauration`,
      'POST',
      undefined,
      t.erreur,
    );
    setMessage(
      resultat.ok
        ? { ok: true, texte: t.restaure(element.libelle) }
        : { ok: false, texte: resultat.erreur },
    );
    if (resultat.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        className={
          message?.ok === false ? 'text-sm text-bad empty:hidden' : 'text-sm text-ok empty:hidden'
        }
      >
        {message?.texte}
      </p>
      {elements.length === 0 ? (
        <p className="text-sm text-muted">{t.vide}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {elements.map((e) => (
            <li key={`${e.type}-${e.id}`} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{t.types[e.type]}</Badge>
                  <span className="text-sm font-semibold">{e.libelle}</span>
                  {e.lies > 0 ? (
                    <span className="text-xs text-muted">· {t.lies(e.lies)}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {t.supprime(formatDateHeure(e.supprimeLe), e.supprimePar)} ·{' '}
                  {t.effacement(formatDate(e.effacementLe))}
                </span>
              </div>
              <Button
                variant="secondary"
                aria-label={t.restaurerElement(e.libelle)}
                onClick={() => void restaurer(e)}
              >
                {t.restaurer}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
