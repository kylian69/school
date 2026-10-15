'use client';

import type { LienDocument } from '@scolaly/contracts';
import { Button, Label } from '@scolaly/ui';
import { useId, useState } from 'react';
import { MessageErreur, SANS_ERREUR } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { useEnvoi } from '../../formations/envoi';

const t = fr.justificatifs;

/**
 * US-06-08, RG-06-21 : ouvrir le document (adresse signée de l'API), puis accepter, refuser avec
 * un motif ou demander un complément ; le message est montré à l'apprenant.
 */
export function Traitement({
  justificatifId,
  document,
  ouvert,
}: {
  justificatifId: string;
  document: boolean;
  ouvert: boolean;
}) {
  const id = useId();
  const { erreurs, setErreurs, envoi, executer } = useEnvoi();
  const [message, setMessage] = useState('');

  async function ouvrir() {
    const reponse = await fetch(`/api/justificatifs/${justificatifId}/document`);
    const corps = (await reponse.json().catch(() => null)) as LienDocument | null;
    if (reponse.ok && corps) {
      setErreurs(SANS_ERREUR);
      window.location.assign(corps.url);
    } else setErreurs({ message: t.erreur, details: [] });
  }

  const decider = (decision: 'accepter' | 'refuser' | 'completer') =>
    void executer(`/api/justificatifs/${justificatifId}/decision`, 'POST', {
      decision,
      ...(message.trim() ? { message } : {}),
    });

  return (
    <div className="flex flex-col gap-3">
      {document ? (
        <div>
          <Button variant="secondary" onClick={() => void ouvrir()}>
            {t.voirDocument}
          </Button>
        </div>
      ) : null}
      {ouvert ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-message`}>{t.message}</Label>
            <textarea
              id={`${id}-message`}
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby={`${id}-message-aide`}
              className="rounded-control border border-line bg-surface px-3 py-2 text-base md:text-sm"
            />
            <p id={`${id}-message-aide`} className="text-xs text-muted">
              {t.messageAide}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={envoi} onClick={() => decider('accepter')}>
              {t.accepter}
            </Button>
            <Button variant="secondary" disabled={envoi} onClick={() => decider('completer')}>
              {t.completer}
            </Button>
            <Button variant="secondary" disabled={envoi} onClick={() => decider('refuser')}>
              {t.refuser}
            </Button>
          </div>
        </>
      ) : null}
      <MessageErreur erreurs={erreurs} />
    </div>
  );
}
