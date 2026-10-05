'use client';

import type { ContexteSession } from '@scolaly/contracts';
import { Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.coquille;

/**
 * Sélecteur d'école (RG-01-29) : n'apparaît que pour une personne qui a des droits dans plusieurs
 * écoles du groupe. Changer d'école ne demande pas de nouvelle connexion.
 */
export function EcoleSelector({ contexte }: { contexte: ContexteSession }) {
  const router = useRouter();
  const id = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  if (contexte.ecoles.length < 2) return null;

  async function changer(organisationId: string) {
    setErreur(null);
    const response = await fetch('/api/session/ecole', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organisationId }),
    }).catch(() => null);
    if (!response?.ok) {
      setErreur(t.changementImpossible);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="px-1 text-xs text-muted">
        {t.changerEcole}
      </Label>
      <select
        id={id}
        value={contexte.ecoleActive?.id ?? ''}
        onChange={(event) => void changer(event.target.value)}
        className="h-11 rounded-control border border-line bg-surface px-3 text-sm md:h-10"
      >
        {contexte.ecoles.map((ecole) => (
          <option key={ecole.id} value={ecole.id}>
            {ecole.nom}
          </option>
        ))}
      </select>
      <p role="alert" aria-live="polite" className="text-xs text-bad">
        {erreur}
      </p>
    </div>
  );
}
