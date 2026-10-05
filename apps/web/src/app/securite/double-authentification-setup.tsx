'use client';

import { Button, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.securite;

interface Preparation {
  qrCode: string;
  cle: string;
  codesDeSecours: string[];
}

const texte = (event: SyntheticEvent<HTMLFormElement>, nom: string) => {
  const valeur = new FormData(event.currentTarget).get(nom);
  return typeof valeur === 'string' ? valeur : '';
};

/**
 * Mise en place en deux temps : le mot de passe confirmé, Better Auth génère le secret et les dix
 * codes de secours ; le premier code saisi active la double authentification et renouvelle la session.
 */
export function DoubleAuthentificationSetup() {
  const router = useRouter();
  const erreurId = useId();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [copies, setCopies] = useState(false);
  const [activee, setActivee] = useState(false);

  async function appeler(url: string, body: unknown): Promise<Response | null> {
    setEnvoi(true);
    setErreur(null);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setErreur(fr.connexion.erreurs.reseau);
      return null;
    } finally {
      setEnvoi(false);
    }
  }

  async function preparer(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const response = await appeler('/api/auth/two-factor/enable', {
      password: texte(event, 'motDePasse'),
    });
    if (!response) return;
    if (!response.ok) {
      setErreur(response.status === 400 ? t.erreurs.motDePasse : fr.connexion.erreurs.inattendue);
      return;
    }
    const { totpURI, backupCodes } = (await response.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    setPreparation({
      qrCode: await QRCode.toDataURL(totpURI, { margin: 1, width: 192 }),
      cle: new URL(totpURI).searchParams.get('secret') ?? '',
      codesDeSecours: backupCodes,
    });
  }

  async function verifier(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const response = await appeler('/api/auth/two-factor/verify-totp', {
      code: texte(event, 'code').replace(/\s/g, ''),
    });
    if (!response) return;
    if (!response.ok) {
      setErreur(t.erreurs.code);
      return;
    }
    setActivee(true);
  }

  if (activee) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          {t.succes}
        </p>
        <Button
          onClick={() => {
            router.replace('/');
            router.refresh();
          }}
        >
          {t.continuer}
        </Button>
      </div>
    );
  }

  const messageErreur = (
    <p id={erreurId} role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
      {erreur}
    </p>
  );

  if (!preparation) {
    return (
      <form className="flex flex-col gap-4" onSubmit={(event) => void preparer(event)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="motDePasse">{t.etapes.motDePasse}</Label>
          <Input
            id="motDePasse"
            name="motDePasse"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreurId}
          />
        </div>
        {messageErreur}
        <Button type="submit" disabled={envoi}>
          {envoi ? t.preparation : t.commencer}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.etapes.scanner}</h3>
        {/* eslint-disable-next-line @next/next/no-img-element -- image générée dans le navigateur */}
        <img
          src={preparation.qrCode}
          alt={t.qrCode}
          width={192}
          height={192}
          className="self-center rounded-control bg-white p-2"
        />
        <p className="text-xs text-muted">{t.cleManuelle}</p>
        <code className="rounded-control bg-surface-2 px-2 py-1.5 font-mono text-xs break-all">
          {preparation.cle}
        </code>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.etapes.codes}</h3>
        <p className="text-xs text-muted">{t.aideCodes}</p>
        <ul
          aria-label={t.etapes.codes}
          className="grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-3 font-mono text-sm"
        >
          {preparation.codesDeSecours.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard
              .writeText(preparation.codesDeSecours.join('\n'))
              .then(() => {
                setCopies(true);
              })
              .catch(() => undefined);
          }}
        >
          {copies ? t.copies : t.copier}
        </Button>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void verifier(event)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{t.etapes.verifier}</Label>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            required
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreurId}
          />
        </div>
        {messageErreur}
        <Button type="submit" disabled={envoi}>
          {envoi ? t.activation : t.activer}
        </Button>
      </form>
    </div>
  );
}
