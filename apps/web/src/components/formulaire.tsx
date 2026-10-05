'use client';

import { Input, Label } from '@scolaly/ui';
import { useId, type ComponentProps } from 'react';
import { erreurDuChamp } from '@/lib/requete';

/** Erreur renvoyée par l'API : message général et détail champ par champ. */
export interface Erreurs {
  message: string | null;
  details: readonly string[];
}
export const SANS_ERREUR: Erreurs = { message: null, details: [] };

/** Champ de formulaire : libellé, saisie et erreur renvoyée par l'API pour ce champ. */
export function Champ({
  nom,
  label,
  erreurs,
  aide,
  ...props
}: ComponentProps<'input'> & { nom: string; label: string; erreurs: Erreurs; aide?: string }) {
  const id = useId();
  const erreur = erreurDuChamp(erreurs.details, nom);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={nom}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur || aide ? `${id}-aide` : undefined}
        {...props}
      />
      {erreur || aide ? (
        <p id={`${id}-aide`} className={erreur ? 'text-sm text-bad' : 'text-xs text-muted'}>
          {erreur ?? aide}
        </p>
      ) : null}
    </div>
  );
}

/** Valeurs d'un formulaire, chaînes seulement. */
export const valeursDuFormulaire = (form: HTMLFormElement) =>
  Object.fromEntries(
    [...new FormData(form)].map(([cle, valeur]) => [cle, typeof valeur === 'string' ? valeur : '']),
  );

/** Message d'erreur et détails qui ne concernent aucun champ affiché. */
export function MessageErreur({
  erreurs,
  champs = [],
}: {
  erreurs: Erreurs;
  champs?: readonly string[];
}) {
  const autres = erreurs.details.filter((d) => !champs.some((c) => d.startsWith(`${c} : `)));
  return (
    <div role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
      {erreurs.message ? <p>{erreurs.message}</p> : null}
      {autres.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {autres.map((d) => (
            <li key={d}>{d.slice(d.indexOf(' : ') + 3)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
