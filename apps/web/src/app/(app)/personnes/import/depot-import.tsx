'use client';

import { TYPES_IMPORT } from '@scolaly/contracts';
import { Button, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.imports;

/** Type de contenu d'après l'extension : les navigateurs ne s'accordent pas sur celui d'un CSV. */
const TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Étape 1 : choix du type de personnes et dépôt du fichier, puis analyse. */
export function DepotImport() {
  const router = useRouter();
  const typeId = useId();
  const fichierId = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fichier = data.get('fichier');
    const type = data.get('type');
    if (!(fichier instanceof File) || typeof type !== 'string') return;
    const contentType = TYPES[fichier.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!contentType) {
      setErreur(t.formatInconnu);
      return;
    }
    setEnvoi(true);
    const parametres = new URLSearchParams({ type, fichier: fichier.name });
    const resultat = await envoyer(
      `/api/imports?${parametres.toString()}`,
      'POST',
      new Blob([fichier], { type: contentType }),
      t.echec,
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(
        resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur,
      );
      return;
    }
    router.push(`/personnes/import/${(resultat.body as { id: string }).id}`);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={typeId}>{t.type}</Label>
        <select
          id={typeId}
          name="type"
          className="h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm"
        >
          {TYPES_IMPORT.map((type) => (
            <option key={type} value={type}>
              {t.types[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fichierId}>{t.fichier}</Label>
        <input
          id={fichierId}
          name="fichier"
          type="file"
          required
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby={`${fichierId}-aide`}
          className="text-sm file:mr-3 file:rounded-control file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm"
        />
        <p id={`${fichierId}-aide`} className="text-xs text-muted">
          {t.aideFichier}{' '}
          <a href="/modeles/personnes.csv" download className="font-medium text-accent underline">
            {t.modele}
          </a>
        </p>
      </div>
      <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
        {erreur}
      </p>
      <Button type="submit" disabled={envoi} className="self-start">
        {envoi ? t.analyse : t.analyser}
      </Button>
    </form>
  );
}
