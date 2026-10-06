'use client';

import { Button, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.connexion.code;

/**
 * Seconde étape de la connexion (RG-01-11) : code de l'application d'authentification, ou l'un des
 * dix codes de secours. Better Auth garde l'étape en cours dans un cookie de dix minutes.
 */
export function CodeForm({ onRetour }: { onRetour: () => void }) {
  const router = useRouter();
  const aideId = useId();
  const erreurId = useId();
  const [secours, setSecours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [expire, setExpire] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setEnvoi(true);
    setErreur(null);
    try {
      const response = await fetch(
        secours ? '/api/auth/two-factor/verify-backup-code' : '/api/auth/two-factor/verify-totp',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: typeof code === 'string' ? code.replace(/\s/g, '') : '' }),
        },
      );
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      if (body?.code === 'INVALID_TWO_FACTOR_COOKIE' || response.status === 403) {
        setExpire(true);
        setErreur(t.expire);
        return;
      }
      setErreur(response.status === 429 ? fr.connexion.erreurs.tropDeTentatives : t.incorrect);
    } catch {
      setErreur(fr.connexion.erreurs.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h2 className="text-base font-semibold">{t.titre}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{secours ? t.champSecours : t.champ}</Label>
        <Input
          key={secours ? 'secours' : 'application'}
          id="code"
          name="code"
          autoComplete="one-time-code"
          inputMode={secours ? 'text' : 'numeric'}
          autoFocus
          required
          aria-invalid={erreur ? true : undefined}
          aria-describedby={`${aideId} ${erreurId}`}
        />
        <p id={aideId} className="text-xs text-muted">
          {secours ? t.aideSecours : t.aide}
        </p>
      </div>
      <p id={erreurId} role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
        {erreur}
      </p>
      {expire ? (
        <Button type="button" onClick={onRetour}>
          {t.recommencer}
        </Button>
      ) : (
        <Button type="submit" disabled={envoi}>
          {envoi ? t.enCours : t.valider}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setSecours(!secours);
          setErreur(null);
        }}
      >
        {secours ? t.utiliserApplication : t.utiliserSecours}
      </Button>
    </form>
  );
}
