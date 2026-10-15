'use client';

import { MotifJustificatif, type Absence, type Justificatif } from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate, formatHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { SELECT } from '../formations/envoi';

const t = fr.justificatifs;

/** Joint le document (photo ou PDF) tel quel, avec son type. */
const joindre = (url: string, fichier: File) =>
  envoyer(url, 'PUT', new Blob([fichier], { type: fichier.type || 'application/pdf' }), t.erreur);

/**
 * E-06-05 · Justifier une absence (US-06-07, RG-06-19) : choix des retards et absences, motif de
 * la liste de l'école, précision facultative sans détail médical (RG-06-20), photo ou PDF.
 */
export function Justifier({
  absences,
  delaiHeures,
}: {
  absences: readonly Absence[];
  delaiHeures: number;
}) {
  const id = useId();
  const router = useRouter();
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const donnees = new FormData(form);
    const absenceIds = donnees.getAll('absenceIds').filter((v) => typeof v === 'string');
    const motif = donnees.get('motif');
    const precision = donnees.get('precision');
    const fichier = donnees.get('document');
    const manque =
      absenceIds.length === 0
        ? t.selection
        : !motif
          ? t.motifManquant
          : !(fichier instanceof File) || fichier.size === 0
            ? t.documentManquant
            : null;
    setSucces(false);
    if (manque || !(fichier instanceof File)) {
      setErreurs({ message: manque, details: [] });
      return;
    }
    setEnvoi(true);
    const cree = await envoyer(
      '/api/moi/justificatifs',
      'POST',
      {
        absenceIds,
        motif,
        ...(typeof precision === 'string' && precision.trim() ? { precision } : {}),
      },
      t.erreur,
    );
    if (!cree.ok) {
      setEnvoi(false);
      setErreurs({ message: cree.erreur, details: cree.details });
      return;
    }
    const justificatif = cree.body as Justificatif;
    const document = await joindre(`/api/moi/justificatifs/${justificatif.id}/document`, fichier);
    setEnvoi(false);
    if (!document.ok) {
      setErreurs({ message: `${t.documentEchec} ${document.erreur}`, details: [] });
    } else {
      setErreurs(SANS_ERREUR);
      setSucces(true);
      form.reset();
    }
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 id={`${id}-titre`} className="text-lg font-semibold">
        {t.justifier}
      </h2>
      <p className="text-sm text-muted">{t.justifierAide(delaiHeures)}</p>
      {absences.length === 0 ? (
        <p className="text-sm text-muted">{t.aucuneAJustifier}</p>
      ) : (
        <form
          aria-labelledby={`${id}-titre`}
          className="flex flex-col gap-4"
          onSubmit={(e) => void soumettre(e)}
          noValidate
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.aJustifier}</legend>
            {absences.map((a) => (
              <label key={a.id} className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="absenceIds"
                  value={a.id}
                  className="mt-1 size-5 shrink-0"
                />
                <span>
                  {a.libelle} · {formatDate(a.jour)} · {formatHeure(a.debut)} – {formatHeure(a.fin)}{' '}
                  · {fr.assiduite.nature[a.nature]}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-motif`}>{t.motifChamp}</Label>
            <select id={`${id}-motif`} name="motif" defaultValue="" className={SELECT}>
              <option value="">{t.choisir}</option>
              {MotifJustificatif.options.map((m) => (
                <option key={m} value={m}>
                  {t.motif[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-precision`}>{t.precision}</Label>
            <textarea
              id={`${id}-precision`}
              name="precision"
              rows={2}
              maxLength={300}
              aria-describedby={`${id}-precision-aide`}
              className="rounded-control border border-line bg-surface px-3 py-2 text-base md:text-sm"
            />
            <p id={`${id}-precision-aide`} className="text-xs text-muted">
              {t.precisionAide}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-document`}>{t.document}</Label>
            <input
              id={`${id}-document`}
              name="document"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="min-h-11 max-w-full text-sm"
            />
          </div>
          <div>
            <Button type="submit" disabled={envoi}>
              {t.deposer}
            </Button>
          </div>
          <MessageErreur erreurs={erreurs} />
          {succes ? (
            <p role="status" className="text-sm text-ok">
              {t.depose}
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}

/** Ajout ou remplacement du document tant que le justificatif n'est pas décidé. */
export function JoindreDocument({ justificatifId }: { justificatifId: string }) {
  const id = useId();
  const router = useRouter();
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [envoi, setEnvoi] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t.joindre}</Label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        disabled={envoi}
        className="min-h-11 max-w-full text-sm"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (!fichier) return;
          setEnvoi(true);
          void joindre(`/api/moi/justificatifs/${justificatifId}/document`, fichier).then((r) => {
            setEnvoi(false);
            setErreurs(r.ok ? SANS_ERREUR : { message: r.erreur, details: r.details });
            if (r.ok) router.refresh();
          });
        }}
      />
      <MessageErreur erreurs={erreurs} />
    </div>
  );
}
