'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.photo;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** Dépôt d'une photo (JPEG ou PNG), envoyée telle quelle à l'adresse donnée (RG-01-26). */
export function DepotPhoto({
  url,
  libelle,
  succes,
}: {
  url: string;
  libelle: string;
  /** Message affiché après l'envoi. */
  succes: string;
}) {
  const router = useRouter();
  const id = useId();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function deposer(fichier: File | undefined) {
    if (!fichier) return;
    const type = TYPES[fichier.name.split('.').pop()?.toLowerCase() ?? ''] ?? fichier.type;
    setEnvoi(true);
    const resultat = await envoyer(url, 'PUT', new Blob([fichier], { type }), t.erreur);
    setEnvoi(false);
    setMessage(
      resultat.ok
        ? { ok: true, texte: succes }
        : {
            ok: false,
            texte:
              resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur,
          },
    );
    if (resultat.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center self-start rounded-control border border-dashed border-line px-4 text-sm font-medium hover:bg-surface-2"
      >
        {envoi ? t.envoi : libelle}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        aria-describedby={`${id}-aide`}
        onChange={(event) => {
          void deposer(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <p id={`${id}-aide`} className="text-xs text-muted">
        {t.aideFormat}
      </p>
      <p
        role="status"
        className={
          message?.ok === false ? 'text-sm text-bad empty:hidden' : 'text-sm text-ok empty:hidden'
        }
      >
        {message?.texte}
      </p>
    </div>
  );
}
