'use client';

import { Button, Input, Label } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.activation;

function messageDe(body: unknown): string {
  if (typeof body !== 'object' || body === null) return t.erreur;
  const { message, details } = body as { message?: unknown; details?: unknown };
  const detail = Array.isArray(details)
    ? details.filter((d): d is string => typeof d === 'string')
    : [];
  return [typeof message === 'string' ? message : t.erreur, ...detail].join(' ');
}

export function ActivationForm({ jeton, email }: { jeton: string; email: string }) {
  const router = useRouter();
  const aideId = useId();
  const erreurId = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [compteExistant, setCompteExistant] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const texte = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const motDePasse = texte('motDePasse');
    if (motDePasse !== texte('confirmation')) {
      setErreur(t.differents);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(jeton)}/activation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motDePasse, conditionsAcceptees: data.get('conditions') === 'on' }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setErreur(messageDe(body));
        return;
      }
      if ((body as { compteExistant?: boolean }).compteExistant) {
        setCompteExistant(true);
        return;
      }
      // Compte créé : connexion immédiate, puis accueil.
      await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: motDePasse }),
      });
      router.replace('/');
      router.refresh();
    } catch {
      setErreur(fr.connexion.erreurs.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  if (compteExistant) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          {t.compteExistant}
        </p>
        <Button asChild>
          <Link href="/connexion">{t.seConnecter}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          readOnly
          autoComplete="username"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="motDePasse">{t.motDePasse}</Label>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby={aideId}
        />
        <p id={aideId} className="text-xs text-muted">
          {t.motDePasseAide}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmation">{t.confirmation}</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <label className="flex min-h-11 items-center gap-2.5 text-sm">
        <input type="checkbox" name="conditions" required className="size-5 accent-accent" />
        <span>
          {t.conditions}{' '}
          <Link href="/conditions-utilisation" target="_blank" className="text-accent underline">
            {t.conditionsLien}
          </Link>
        </span>
      </label>
      <p id={erreurId} role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
        {erreur}
      </p>
      <Button type="submit" disabled={envoi} aria-describedby={erreurId}>
        {envoi ? t.enCours : t.valider}
      </Button>
    </form>
  );
}
