'use client';

import type { ContactEntreprise, Contrat } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.contrats;
const comptes = fr.entreprises.contact.comptes;
const TONS = { cree: 'neutral', invite: 'warn', actif: 'ok', desactive: 'bad' } as const;

/** Tuteurs du contrat et leurs périodes ; invitation (US-03-03) et changement (section 7). */
export function TuteursContrat({
  contrat,
  tuteursEntreprise,
  inviter,
}: {
  contrat: Contrat;
  tuteursEntreprise: readonly ContactEntreprise[];
  inviter: boolean;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const [message, setMessage] = useState<string | null>(null);
  const [changement, setChangement] = useState(false);
  const actif = contrat.statut !== 'termine' && contrat.statut !== 'rompu';

  async function inviterTuteur(personneId: string) {
    const resultat = await executer(`/api/comptes/${personneId}/invitation`, 'POST');
    setMessage(resultat.ok ? t.actions.invitationEnvoyee : null);
  }

  return (
    <Card className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.fiche.tuteurs}</h2>
        {contrat.modifiable && actif && tuteursEntreprise.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              setChangement(true);
            }}
          >
            {t.actions.changerTuteur}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {contrat.tuteurs.map((x) => {
          const nom = `${x.personne.prenom} ${x.personne.nom}`;
          return (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{nom}</span>
                  <Badge tone={TONS[x.personne.compteEtat]}>{comptes[x.personne.compteEtat]}</Badge>
                </div>
                <p className="text-sm text-muted">
                  {t.fiche.depuis(formatDate(x.debut), x.fin ? formatDate(x.fin) : null)}
                </p>
              </div>
              {inviter && actif && x.fin === null && x.personne.compteEtat !== 'actif' ? (
                <Button
                  variant="secondary"
                  disabled={envoi}
                  onClick={() => void inviterTuteur(x.personne.id)}
                >
                  {t.actions.inviter(nom)}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {message ? (
        <p role="status" className="text-sm text-ok">
          {message}
        </p>
      ) : null}
      <MessageErreur erreurs={erreurs} />
      {changement ? (
        <Changement
          contrat={contrat}
          tuteursEntreprise={tuteursEntreprise}
          onFermer={() => {
            setChangement(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function Changement({
  contrat,
  tuteursEntreprise,
  onFermer,
}: {
  contrat: Contrat;
  tuteursEntreprise: readonly ContactEntreprise[];
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { nouveau: useId(), remplace: useId() };
  const enPlace = contrat.tuteurs.filter((x) => x.fin === null);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/contrats/${contrat.id}/tuteurs`, 'POST', {
      personneId: texte(d.get('personneId')),
      date: texte(d.get('date')),
      remplace: texte(d.get('remplace')) || null,
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
      <DialogContent
        title={t.actions.changerTuteur}
        className="max-h-[85vh] max-w-xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.nouveau}>{t.changement.nouveau}</Label>
            <select id={ids.nouveau} name="personneId" className={SELECT}>
              {tuteursEntreprise.map((c) => (
                <option key={c.personne.id} value={c.personne.id}>
                  {`${c.personne.prenom} ${c.personne.nom}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.remplace}>{t.changement.remplace}</Label>
            <select
              id={ids.remplace}
              name="remplace"
              defaultValue={enPlace[0]?.personne.id ?? ''}
              className={SELECT}
            >
              <option value="">{t.changement.aucun}</option>
              {enPlace.map((x) => (
                <option key={x.personne.id} value={x.personne.id}>
                  {`${x.personne.prenom} ${x.personne.nom}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">{t.changement.aide}</p>
          </div>
          <Champ
            nom="date"
            label={t.changement.date}
            erreurs={erreurs}
            type="date"
            required
            min={contrat.debut}
            max={contrat.fin}
          />
          <MessageErreur erreurs={erreurs} champs={['date']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
