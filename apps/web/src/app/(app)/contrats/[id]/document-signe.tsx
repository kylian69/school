'use client';

import type { LienDocument } from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import { useId, useState } from 'react';
import { MessageErreur, SANS_ERREUR } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { useEnvoi } from '../../formations/envoi';

const t = fr.contrats.fiche;

/** Contrat ou convention signés (PDF) : dépôt, puis téléchargement par un lien signé. */
export function DocumentSigne({
  url,
  present,
  modifiable,
}: {
  url: string;
  present: boolean;
  modifiable: boolean;
}) {
  const id = useId();
  const { erreurs, setErreurs, envoi, executer } = useEnvoi();
  const [telechargement, setTelechargement] = useState(false);

  async function telecharger() {
    setTelechargement(true);
    const reponse = await fetch(url);
    setTelechargement(false);
    const corps = (await reponse.json().catch(() => null)) as LienDocument | null;
    if (reponse.ok && corps) {
      setErreurs(SANS_ERREUR);
      window.location.assign(corps.url);
    } else setErreurs({ message: fr.contrats.erreur, details: [] });
  }

  return (
    <Card className="flex max-w-3xl flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.document}</h2>
      {present ? (
        <div>
          <Button variant="secondary" disabled={telechargement} onClick={() => void telecharger()}>
            {t.telecharger}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t.aucunDocument}</p>
      )}
      {modifiable ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{t.deposer}</Label>
          <input
            id={id}
            type="file"
            accept="application/pdf"
            disabled={envoi}
            className="min-h-11 max-w-full text-sm"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier)
                void executer(url, 'PUT', new Blob([fichier], { type: 'application/pdf' }));
            }}
          />
        </div>
      ) : null}
      <MessageErreur erreurs={erreurs} />
    </Card>
  );
}
