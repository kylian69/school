'use client';

import { TYPES_CONTACT, type ContactEntreprise, type Entreprise } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.entreprises;
const tc = t.contact;
const TONS = { cree: 'neutral', invite: 'warn', actif: 'ok', desactive: 'bad' } as const;

/** Contacts et tuteurs (RG-03-03) ; invitation d'un tuteur en un clic (US-03-03). */
export function ContactsEntreprise({
  entreprise,
  inviter,
}: {
  entreprise: Entreprise;
  inviter: boolean;
}) {
  const [ajout, setAjout] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { erreurs, envoi, executer } = useEnvoi();

  async function inviterTuteur(c: ContactEntreprise) {
    const resultat = await executer(`/api/comptes/${c.personne.id}/invitation`, 'POST');
    setMessage(resultat.ok ? tc.invitationEnvoyee : null);
  }

  async function retirer(c: ContactEntreprise) {
    if (!window.confirm(tc.confirmerRetrait)) return;
    await executer(`/api/contacts-entreprise/${c.id}`, 'DELETE');
  }

  return (
    <Card className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.fiche.contacts}</h2>
        {entreprise.modifiable ? (
          <Button
            variant="secondary"
            onClick={() => {
              setAjout(true);
            }}
          >
            {t.fiche.ajouterContact}
          </Button>
        ) : null}
      </div>
      {entreprise.contacts.length === 0 ? (
        <p className="text-sm text-muted">{t.fiche.aucunContact}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {entreprise.contacts.map((c) => {
            const nom = `${c.personne.prenom} ${c.personne.nom}`;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nom}</span>
                    <Badge tone={c.type === 'tuteur' ? 'accent' : 'neutral'}>
                      {tc.types[c.type]}
                    </Badge>
                    <Badge tone={TONS[c.personne.compteEtat]}>
                      {tc.comptes[c.personne.compteEtat]}
                    </Badge>
                  </div>
                  <p className="break-all text-sm text-muted">
                    {[c.fonction, c.personne.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inviter && c.type === 'tuteur' && c.personne.compteEtat !== 'actif' ? (
                    <Button
                      variant="secondary"
                      disabled={envoi}
                      onClick={() => void inviterTuteur(c)}
                    >
                      {tc.inviter(nom)}
                    </Button>
                  ) : null}
                  {entreprise.modifiable ? (
                    <Button variant="ghost" disabled={envoi} onClick={() => void retirer(c)}>
                      {tc.retirer(nom)}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {message ? (
        <p role="status" className="text-sm text-ok">
          {message}
        </p>
      ) : null}
      {!ajout ? <MessageErreur erreurs={erreurs} /> : null}
      {ajout ? (
        <AjoutContact
          entrepriseId={entreprise.id}
          onFermer={() => {
            setAjout(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function AjoutContact({ entrepriseId, onFermer }: { entrepriseId: string; onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const idType = useId();
  const [type, setType] = useState<(typeof TYPES_CONTACT)[number]>('tuteur');

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/entreprises/${entrepriseId}/contacts`, 'POST', {
      type,
      fonction: texte(d.get('fonction')) || null,
      dansEntrepriseDepuis: texte(d.get('dansEntrepriseDepuis')) || null,
      personne: {
        nom: texte(d.get('nom')),
        prenom: texte(d.get('prenom')),
        email: texte(d.get('email')),
      },
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
        title={t.fiche.ajouterContact}
        className="max-h-[85vh] max-w-xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idType}>{tc.type}</Label>
            <select
              id={idType}
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
              }}
              className={SELECT}
            >
              {TYPES_CONTACT.map((c) => (
                <option key={c} value={c}>
                  {tc.types[c]}
                </option>
              ))}
            </select>
            {type === 'tuteur' ? <p className="text-xs text-muted">{tc.tuteurAide}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ nom="prenom" label={tc.prenom} erreurs={erreurs} required maxLength={100} />
            <Champ nom="nom" label={tc.nom} erreurs={erreurs} required maxLength={100} />
          </div>
          <Champ
            nom="email"
            label={tc.email}
            erreurs={erreurs}
            type="email"
            required
            maxLength={200}
          />
          <Champ nom="fonction" label={tc.fonction} erreurs={erreurs} maxLength={120} />
          <Champ
            nom="dansEntrepriseDepuis"
            label={tc.depuis}
            aide={tc.depuisAide}
            erreurs={erreurs}
            type="date"
          />
          <MessageErreur
            erreurs={erreurs}
            champs={['nom', 'prenom', 'email', 'fonction', 'dansEntrepriseDepuis']}
          />
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
