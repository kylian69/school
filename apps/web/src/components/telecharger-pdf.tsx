'use client';

import { Button } from '@scolaly/ui';
import { useState, type ComponentProps } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.feuilles;

/** Nom proposé par l'API (Content-Disposition, nom UTF-8 de préférence). */
function nomDuFichier(disposition: string | null): string {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return /filename="([^"]+)"/i.exec(disposition ?? '')?.[1] ?? 'document.pdf';
}

/**
 * Télécharge un PDF produit par l'API (même origine, ADR 0007) sans quitter la page ; renvoie le
 * message d'erreur de l'API, ou null si le fichier est remis.
 */
export async function telechargerPdf(url: string): Promise<string | null> {
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) {
      const corps = (await reponse.json().catch(() => null)) as { message?: unknown } | null;
      return typeof corps?.message === 'string' ? corps.message : t.erreur;
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(await reponse.blob());
    lien.download = nomDuFichier(reponse.headers.get('content-disposition'));
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => {
      URL.revokeObjectURL(lien.href);
    }, 10_000);
    return null;
  } catch {
    return t.erreur;
  }
}

/** Bouton de téléchargement d'un PDF à adresse fixe, avec l'erreur affichée en dessous. */
export function BoutonPdf({
  url,
  libelle,
  variant = 'secondary',
}: {
  url: string;
  libelle: string;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={enCours}
        onClick={() => {
          setEnCours(true);
          void telechargerPdf(url).then((message) => {
            setErreur(message);
            setEnCours(false);
          });
        }}
      >
        {enCours ? t.enCours : libelle}
      </Button>
      {erreur ? (
        <p role="alert" className="text-sm text-bad">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
