'use client';

import { MOTIFS_RUPTURE, type Contrat } from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.contrats;

/** RG-03-05 : changements de statut ; US-03-12 : rupture ; suppression d'un brouillon. */
export function ActionsContrat({ contrat }: { contrat: Contrat }) {
  const router = useRouter();
  const { erreurs, envoi, executer } = useEnvoi();
  const [rupture, setRupture] = useState(false);
  const statut = (vers: 'signe' | 'en_cours' | 'termine') =>
    void executer(`/api/contrats/${contrat.id}`, 'PATCH', { statut: vers });

  async function supprimer() {
    if (!window.confirm(t.actions.confirmerSuppression)) return;
    const resultat = await executer(`/api/contrats/${contrat.id}`, 'DELETE');
    if (resultat.ok) router.push('/contrats');
  }

  if (contrat.statut === 'termine' || contrat.statut === 'rompu') return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {contrat.statut === 'brouillon' ? (
          <>
            <Button
              disabled={envoi}
              onClick={() => {
                statut('signe');
              }}
            >
              {t.actions.signer}
            </Button>
            <Button variant="ghost" disabled={envoi} onClick={() => void supprimer()}>
              {t.actions.supprimer}
            </Button>
          </>
        ) : (
          <>
            {contrat.statut === 'signe' ? (
              <Button
                disabled={envoi}
                onClick={() => {
                  statut('en_cours');
                }}
              >
                {t.actions.demarrer}
              </Button>
            ) : (
              <Button
                disabled={envoi}
                onClick={() => {
                  statut('termine');
                }}
              >
                {t.actions.terminer}
              </Button>
            )}
            <Button
              variant="danger"
              disabled={envoi}
              onClick={() => {
                setRupture(true);
              }}
            >
              {t.actions.rompre}
            </Button>
          </>
        )}
      </div>
      <MessageErreur erreurs={erreurs} />
      {rupture ? (
        <Rupture
          contrat={contrat}
          onFermer={() => {
            setRupture(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Rupture({ contrat, onFermer }: { contrat: Contrat; onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const idMotif = useId();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/contrats/${contrat.id}/rupture`, 'POST', {
      date: texte(d.get('date')),
      motif: texte(d.get('motif')),
      poursuiteSansEmployeur: d.get('poursuiteSansEmployeur') === 'on',
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={t.actions.rompre} className="max-h-[85vh] max-w-xl overflow-y-auto">
        <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
          <p className="text-sm text-muted">{t.rupture.aide}</p>
          <Champ
            nom="date"
            label={t.rupture.date}
            erreurs={erreurs}
            type="date"
            required
            min={contrat.debut}
            max={contrat.fin}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idMotif}>{t.rupture.motif}</Label>
            <select id={idMotif} name="motif" className={SELECT}>
              {MOTIFS_RUPTURE.map((m) => (
                <option key={m} value={m}>
                  {t.motifs[m]}
                </option>
              ))}
            </select>
          </div>
          {contrat.type === 'apprentissage' ? (
            <label className="flex min-h-11 items-start gap-2 text-sm md:min-h-0">
              <input type="checkbox" name="poursuiteSansEmployeur" className="mt-1 size-4" />
              <span>
                {t.rupture.sansEmployeur}
                <span className="block text-xs text-muted">{t.rupture.sansEmployeurAide}</span>
              </span>
            </label>
          ) : null}
          <MessageErreur erreurs={erreurs} champs={['date']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" variant="danger" disabled={envoi}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
