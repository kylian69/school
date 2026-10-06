'use client';

import { MODULES, type ClientFiche } from '@scolaly/contracts';
import { Button, cn, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.console.fiche;

async function envoyer(
  url: string,
  method: 'POST' | 'PUT',
  corps: unknown,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      details?: unknown;
    } | null;
    const details = Array.isArray(body?.details) ? ` ${body.details.join(' ')}` : '';
    return `${typeof body?.message === 'string' ? body.message : t.erreur}${details}`;
  } catch {
    return fr.connexion.erreurs.reseau;
  }
}

type Cible = 'actif' | 'suspendu' | 'resilie';
const CIBLES: Record<ClientFiche['etat'], Cible[]> = {
  actif: ['suspendu', 'resilie'],
  suspendu: ['actif', 'resilie'],
  resilie: [],
  supprime: [],
};
const LIBELLES: Record<Cible, string> = {
  actif: t.reactiver,
  suspendu: t.suspendre,
  resilie: t.resilier,
};

/** Changement d'état d'un client, avec motif obligatoire (RG-19-02). */
export function EtatActions({ client }: { client: ClientFiche }) {
  const router = useRouter();
  const motifId = useId();
  const [cible, setCible] = useState<Cible | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!cible) return;
    const motif = new FormData(event.currentTarget).get('motif');
    const probleme = await envoyer(`/api/plateforme/clients/${client.id}/etat`, 'POST', {
      etat: cible,
      motif,
    });
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setCible(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CIBLES[client.etat].map((etat) => (
        <Button
          key={etat}
          variant={etat === 'actif' ? 'primary' : etat === 'resilie' ? 'danger' : 'secondary'}
          onClick={() => {
            setErreur(null);
            setCible(etat);
          }}
        >
          {LIBELLES[etat]}
        </Button>
      ))}
      <Dialog
        open={cible !== null}
        onOpenChange={(open) => {
          if (!open) setCible(null);
        }}
      >
        <DialogContent
          title={cible ? `${LIBELLES[cible]} · ${client.raisonSociale}` : t.changerEtat}
        >
          <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={motifId}>{t.motif}</Label>
              <textarea
                id={motifId}
                name="motif"
                required
                minLength={3}
                rows={3}
                className="rounded-control border border-line bg-surface p-3 text-sm"
              />
            </div>
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
              {erreur}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCible(null);
                }}
              >
                {t.annuler}
              </Button>
              <Button type="submit" variant={cible === 'resilie' ? 'danger' : 'primary'}>
                {t.confirmer}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Modules du client : formule et exceptions (RG-19-04). Modifiables par le super-administrateur. */
export function ModulesClient({
  client,
  modifiable,
}: {
  client: ClientFiche;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const etat = new Map(client.modules.map((m) => [m.module, m]));

  async function basculer(module: string, actif: boolean) {
    setEnCours(module);
    setErreur(
      await envoyer(`/api/plateforme/clients/${client.id}/modules`, 'PUT', { module, actif }),
    );
    setEnCours(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {MODULES.map(({ code, numero, libelle }) => {
          const ligne = etat.get(code);
          const actif = ligne?.actif ?? false;
          return (
            <li
              key={code}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1.5 text-sm"
            >
              <span className="flex flex-col">
                <span>
                  <span className="num font-mono text-xs text-muted">{numero}</span> {libelle}
                </span>
                {ligne?.origine === 'exception' ? (
                  <span className="text-xs text-warn">{t.origineException}</span>
                ) : null}
              </span>
              {modifiable ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={actif}
                  aria-label={actif ? t.desactiver(libelle) : t.activer(libelle)}
                  disabled={enCours !== null}
                  onClick={() => void basculer(code, !actif)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line transition',
                    actif ? 'bg-accent' : 'bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block size-4 rounded-full bg-surface transition',
                      actif ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
              ) : (
                <span className={actif ? 'text-ok' : 'text-muted'}>
                  {actif ? t.actif : t.inactif}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
        {erreur}
      </p>
    </div>
  );
}
