'use client';

import type { FluxIcal } from '@scolaly/contracts';
import { Badge, Button, Card, Input, Label } from '@scolaly/ui';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.connexions;

/**
 * Abonnement de l'agenda au flux iCal personnel (RG-04-15). L'adresse n'est connue qu'à sa
 * création (seule son empreinte est conservée) : elle est affichée une fois, à copier aussitôt.
 */
export function AbonnementAgenda({ initial }: { initial: FluxIcal }) {
  const [flux, setFlux] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [copiee, setCopiee] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function agir(method: 'POST' | 'DELETE') {
    setEnvoi(true);
    setMessage(null);
    setCopiee(false);
    const resultat = await envoyer('/api/moi/agenda', method);
    setEnvoi(false);
    if (!resultat.ok) {
      setMessage({ ok: false, texte: resultat.erreur });
      return;
    }
    const regenere = method === 'POST' && flux.actif;
    setFlux(resultat.body as FluxIcal);
    if (method === 'DELETE') setMessage({ ok: true, texte: t.revoque });
    else if (regenere) setMessage({ ok: true, texte: t.regeneree });
  }

  return (
    <Card className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-[620]">{t.agendaTitre}</h2>
        <Badge tone={flux.actif ? 'ok' : 'neutral'}>{flux.actif ? t.actif : t.inactif}</Badge>
      </div>
      <p className="text-sm text-muted">{t.agendaAide}</p>

      {flux.url ? (
        <div className="flex flex-col gap-2 rounded-control bg-accent-soft p-3">
          <Label htmlFor="adresse-agenda">{t.adresse}</Label>
          <Input
            id="adresse-agenda"
            readOnly
            value={flux.url}
            className="font-mono text-xs"
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
          <p className="text-sm">{t.uneFois}</p>
          <Button
            type="button"
            className="self-start"
            onClick={() => {
              void navigator.clipboard
                .writeText(flux.url ?? '')
                .then(() => {
                  setCopiee(true);
                })
                .catch(() => undefined);
            }}
          >
            {copiee ? t.copiee : t.copier}
          </Button>
        </div>
      ) : flux.actif ? (
        <p className="text-sm text-muted">
          {flux.regenereLe ? `${t.depuis(formatDate(flux.regenereLe))} ` : ''}
          {t.cachee}
        </p>
      ) : null}

      <p className="text-sm text-muted">{t.confidentialite}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={envoi} onClick={() => void agir('POST')}>
          {envoi ? t.enCours : flux.actif ? t.regenerer : t.activer}
        </Button>
        {flux.actif ? (
          <Button
            type="button"
            variant="secondary"
            disabled={envoi}
            onClick={() => void agir('DELETE')}
          >
            {t.revoquer}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className={message.ok ? 'text-sm text-ok' : 'text-sm text-bad'}>
          {message.texte}
        </p>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-[560]">{t.commentFaire}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>{t.google}</li>
          <li>{t.outlook}</li>
          <li>{t.apple}</li>
        </ul>
        <p className="mt-2 text-muted">{t.delai}</p>
      </details>
    </Card>
  );
}
