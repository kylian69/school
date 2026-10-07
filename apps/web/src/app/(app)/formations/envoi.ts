'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

/**
 * Écriture vers l'API depuis les écrans du référentiel : garde l'erreur renvoyée (message et
 * détail par champ) et recharge les données de la page en cas de succès.
 */
export function useEnvoi() {
  const router = useRouter();
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [envoi, setEnvoi] = useState(false);

  async function executer(
    url: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    corps?: unknown,
  ): Promise<{ ok: true; body: unknown } | { ok: false }> {
    setEnvoi(true);
    const resultat = await envoyer(url, method, corps, fr.referentiel.erreur);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      return { ok: false };
    }
    setErreurs(SANS_ERREUR);
    router.refresh();
    return { ok: true, body: resultat.body };
  }

  return { erreurs, setErreurs, envoi, executer };
}

/** Nombre saisi dans un champ (virgule acceptée) ; vide : undefined. */
export function nombre(valeur: FormDataEntryValue | null): number | undefined {
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  const n = Number(valeur.replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

export const texte = (valeur: FormDataEntryValue | null) =>
  typeof valeur === 'string' ? valeur.trim() : '';

/** Nombre affiché à la française (virgule décimale, deux décimales au plus). */
export const chiffre = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

export const SELECT =
  'h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm';
