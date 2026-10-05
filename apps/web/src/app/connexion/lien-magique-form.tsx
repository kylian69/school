'use client';

import { Button, Input, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.connexion.lienMagique;

/**
 * Connexion par lien magique (US-01-08, RG-01-10). Le message est le même que l'adresse
 * corresponde ou non à un compte : la page ne révèle pas qui a un compte.
 */
export function LienMagiqueForm({ onRetour }: { onRetour: () => void }) {
  const messageId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setEnvoi(true);
    try {
      const response = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: '/' }),
      });
      setMessage(response.status === 429 ? fr.connexion.erreurs.tropDeTentatives : t.envoye);
    } catch {
      setMessage(fr.connexion.erreurs.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
      <h2 className="text-base font-semibold">{t.titre}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email-lien">{fr.connexion.email}</Label>
        <Input id="email-lien" name="email" type="email" autoComplete="username" required />
      </div>
      <p id={messageId} role="status" aria-live="polite" className="min-h-5 text-sm">
        {message}
      </p>
      <Button type="submit" disabled={envoi} aria-describedby={messageId}>
        {envoi ? t.enCours : t.envoyer}
      </Button>
      <Button variant="ghost" onClick={onRetour}>
        {t.retour}
      </Button>
    </form>
  );
}
