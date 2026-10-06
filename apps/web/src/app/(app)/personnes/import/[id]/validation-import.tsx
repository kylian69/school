'use client';

import type { ApercuImport } from '@scolaly/contracts';
import { Button, Card } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.imports;

/** Étape 4 : validation (RG-01-19), puis bilan, rapport et annulation (RG-01-20). */
export function ValidationImport({ apercu }: { apercu: ApercuImport }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function executer(url: string, corps?: unknown) {
    setEnvoi(true);
    const resultat = await envoyer(url, 'POST', corps, t.echec);
    setEnvoi(false);
    setErreur(resultat.ok ? null : resultat.erreur);
    if (resultat.ok) router.refresh();
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void executer(`/api/imports/${apercu.id}/validation`, {
      mode: data.get('mode') === 'valides' ? 'valides' : 'tout',
      existants: data.get('existants') === 'mettre-a-jour' ? 'mettre-a-jour' : 'ignorer',
    });
  }

  const alerte = (
    <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
      {erreur}
    </p>
  );

  if (apercu.statut === 'annule') {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm">{t.annule}</p>
        <Link href="/personnes" className="text-sm font-medium text-accent underline">
          {t.voirPersonnes}
        </Link>
      </Card>
    );
  }

  if (apercu.bilan) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.bilanTitre}</h2>
        <p role="status" className="text-sm">
          {t.bilan(apercu.bilan.crees, apercu.bilan.modifies, apercu.bilan.rejetes)}
        </p>
        <div className="flex flex-wrap gap-3">
          {apercu.bilan.rejetes > 0 ? (
            <a
              href={`/api/imports/${apercu.id}/rapport`}
              download
              className="text-sm font-medium text-accent underline"
            >
              {t.rapport}
            </a>
          ) : null}
          <Link href="/personnes" className="text-sm font-medium text-accent underline">
            {t.voirPersonnes}
          </Link>
        </div>
        {apercu.bilan.annulable ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-xs text-muted">{t.aideAnnuler}</p>
            <Button
              variant="danger"
              className="self-start"
              disabled={envoi}
              onClick={() => void executer(`/api/imports/${apercu.id}/annulation`)}
            >
              {t.annuler}
            </Button>
          </div>
        ) : null}
        {alerte}
      </Card>
    );
  }

  if (apercu.champsManquants.length > 0) return null;
  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold">{t.validation}</h2>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 font-semibold">{t.mode}</legend>
          <label className="flex min-h-11 items-center gap-3 md:min-h-9">
            <input type="radio" name="mode" value="tout" defaultChecked className="size-4" />
            {t.modeTout}
          </label>
          <label className="flex min-h-11 items-center gap-3 md:min-h-9">
            <input type="radio" name="mode" value="valides" className="size-4" />
            {t.modeValides}
          </label>
        </fieldset>
        {apercu.totaux.existantes > 0 ? (
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 font-semibold">{t.existants}</legend>
            <label className="flex min-h-11 items-center gap-3 md:min-h-9">
              <input
                type="radio"
                name="existants"
                value="ignorer"
                defaultChecked
                className="size-4"
              />
              {t.existantsIgnorer}
            </label>
            <label className="flex min-h-11 items-center gap-3 md:min-h-9">
              <input type="radio" name="existants" value="mettre-a-jour" className="size-4" />
              {t.existantsMettreAJour}
            </label>
          </fieldset>
        ) : null}
        {alerte}
        <Button type="submit" disabled={envoi} className="self-start">
          {envoi ? t.validation_enCours : t.valider}
        </Button>
      </form>
    </Card>
  );
}
