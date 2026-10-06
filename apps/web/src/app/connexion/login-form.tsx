'use client';

import { Button, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.connexion;

function messageFor(status: number, body: unknown): string {
  if (status === 401 || status === 400) return t.erreurs.identifiants;
  if (status === 429) {
    // Verrouillage progressif : l'API indique la durée d'attente.
    const message = (body as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message.startsWith('Trop de tentatives')
      ? message
      : t.erreurs.tropDeTentatives;
  }
  return t.erreurs.inattendue;
}

/** Connexion par email et mot de passe (Better Auth, servi sur la même origine sous /api/auth). */
export function LoginForm({ onCodeRequis }: { onCodeRequis: () => void }) {
  const router = useRouter();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        // Double authentification active : le code est demandé avant d'ouvrir la session.
        if ((body as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
          onCodeRequis();
          return;
        }
        router.replace('/');
        router.refresh();
        return;
      }
      setError(messageFor(response.status, body));
    } catch {
      setError(t.erreurs.reseau);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.motDePasse}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <p id={errorId} role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
        {error}
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? t.enCours : t.valider}
      </Button>
    </form>
  );
}
