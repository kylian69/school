'use client';

import type { BilanImportPhotos } from '@scolaly/contracts';
import { useId, useState } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.photo.import;

/** Dépôt de l'archive ZIP, puis bilan : photos associées, fichiers sans correspondance, refus. */
export function ImportPhotos() {
  const id = useId();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<BilanImportPhotos | null>(null);

  async function importer(fichier: File | undefined) {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    setBilan(null);
    const resultat = await envoyer(
      '/api/photos/import',
      'POST',
      new Blob([fichier], { type: 'application/zip' }),
      t.erreur,
    );
    setEnvoi(false);
    if (resultat.ok) {
      setBilan(resultat.body as BilanImportPhotos);
    } else {
      setErreur(
        resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t.aide}</p>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={id}
          className="flex min-h-11 cursor-pointer items-center self-start rounded-control border border-dashed border-line px-4 text-sm font-medium hover:bg-surface-2"
        >
          {envoi ? t.envoi : t.deposer}
        </label>
        <input
          id={id}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          disabled={envoi}
          aria-describedby={`${id}-aide`}
          onChange={(event) => {
            void importer(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <p id={`${id}-aide`} className="text-xs text-muted">
          {t.aideFormat}
        </p>
      </div>
      <p role="alert" className="text-sm text-bad empty:hidden">
        {erreur}
      </p>
      <section aria-live="polite" aria-label={t.bilan} className="flex flex-col gap-3">
        {bilan ? (
          <>
            <h2 className="text-base font-semibold">{t.bilan}</h2>
            <p className="text-sm text-ok">{t.associees(bilan.associees)}</p>
            {bilan.sansCorrespondance.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">
                  {t.sansCorrespondance(bilan.sansCorrespondance.length)}
                </h3>
                <ul className="list-disc pl-5 text-sm">
                  {bilan.sansCorrespondance.map((fichier) => (
                    <li key={fichier}>{fichier}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bilan.rejetes.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">{t.rejetes(bilan.rejetes.length)}</h3>
                <ul className="list-disc pl-5 text-sm">
                  {bilan.rejetes.map(({ fichier, motif }) => (
                    <li key={fichier}>
                      {fichier} : {motif}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bilan.sansCorrespondance.length + bilan.rejetes.length > 0 ? (
              <p className="text-sm text-muted">{t.conseil}</p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
