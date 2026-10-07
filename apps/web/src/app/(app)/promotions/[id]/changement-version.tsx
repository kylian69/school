'use client';

import type { DetailPromotion } from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState } from 'react';
import { MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, useEnvoi } from '../../formations/envoi';

const t = fr.scolarite;

/** RG-02-05 : changer la version de maquette d'une promotion, avec confirmation. */
export function ChangementVersion({ promotion }: { promotion: DetailPromotion }) {
  const [ouvert, setOuvert] = useState(false);
  const autres = promotion.versionsDisponibles.filter((v) => v.id !== promotion.version.id);
  const [versionId, setVersionId] = useState(autres.at(-1)?.id ?? '');
  const { erreurs, envoi, executer } = useEnvoi();
  const id = useId();
  if (autres.length === 0) return null;
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setOuvert(true);
        }}
      >
        {t.changerVersion}
      </Button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent title={t.changerVersion}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{t.aideChangerVersion}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{t.nouvelleVersion}</Label>
              <select
                id={id}
                value={versionId}
                onChange={(e) => {
                  setVersionId(e.target.value);
                }}
                className={SELECT}
              >
                {autres.map((v) => (
                  <option key={v.id} value={v.id}>
                    {t.version(v.numero)}
                  </option>
                ))}
              </select>
            </div>
            <MessageErreur erreurs={erreurs} />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setOuvert(false);
                }}
              >
                {t.annuler}
              </Button>
              <Button
                disabled={envoi}
                onClick={() =>
                  void executer(`/api/promotions/${promotion.id}`, 'PATCH', {
                    versionId,
                    confirmation: true,
                  }).then((r) => {
                    if (r.ok) setOuvert(false);
                  })
                }
              >
                {t.confirmer}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
