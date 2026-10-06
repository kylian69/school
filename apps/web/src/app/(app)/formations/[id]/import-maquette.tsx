'use client';

import type { ResultatImportMaquette } from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.referentiel.import;
const TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Import d'une maquette (US-02-02) ou d'un référentiel de compétences (RG-02-21) : le fichier est
 * d'abord vérifié sans rien écrire, puis importé tout ou rien.
 */
export function ImportMaquette({
  versionId,
  type,
}: {
  versionId: string;
  type: 'maquette' | 'competences';
}) {
  const router = useRouter();
  const idFichier = useId();
  const [ouvert, setOuvert] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [resultat, setResultat] = useState<ResultatImportMaquette | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const modele = type === 'maquette' ? t.modeleMaquette : t.modeleCompetences;

  async function deposer(apercu: boolean) {
    if (!fichier) return;
    const contentType = TYPES[fichier.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!contentType) {
      setErreur(t.formatInconnu);
      return;
    }
    setEnvoi(true);
    const reponse = await envoyer(
      `/api/maquettes/${versionId}/import?${new URLSearchParams({ type, apercu: String(apercu) }).toString()}`,
      'POST',
      new Blob([fichier], { type: contentType }),
      fr.referentiel.erreur,
    );
    setEnvoi(false);
    if (!reponse.ok) {
      setErreur(reponse.erreur);
      setResultat(null);
      return;
    }
    setErreur(null);
    const lu = reponse.body as ResultatImportMaquette;
    setResultat(lu);
    if (lu.importe) router.refresh();
  }

  function fermer() {
    setOuvert(false);
    setFichier(null);
    setResultat(null);
    setErreur(null);
  }

  const contenuModele = String.fromCharCode(0xfeff) + modele + String.fromCharCode(13, 10);
  const lienModele = `data:text/csv;charset=utf-8,${encodeURIComponent(contenuModele)}`;
  const nombres = resultat
    ? type === 'maquette'
      ? t.resumeMaquette(resultat.blocs, resultat.ues, resultat.modules)
      : t.resumeCompetences(resultat.blocs, resultat.competences)
    : '';

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOuvert(true);
        }}
      >
        {type === 'maquette' ? t.boutonMaquette : t.boutonCompetences}
      </Button>
      <Dialog
        open={ouvert}
        onOpenChange={(open) => {
          if (!open) fermer();
        }}
      >
        <DialogContent
          title={type === 'maquette' ? t.titreMaquette : t.titreCompetences}
          className="max-h-[85vh] max-w-2xl overflow-y-auto"
        >
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
              event.preventDefault();
              void deposer(true);
            }}
          >
            <p className="text-sm text-muted">{t.aide}</p>
            <p className="text-sm">
              {t.colonnes}{' '}
              <span className="font-mono text-xs">{modele.replaceAll(';', ' · ')}</span>
            </p>
            <a
              href={lienModele}
              download={type === 'maquette' ? 'modele-maquette.csv' : 'modele-competences.csv'}
              className="self-start text-sm text-accent underline underline-offset-4"
            >
              {t.telecharger}
            </a>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idFichier}>{t.fichier}</Label>
              <input
                id={idFichier}
                type="file"
                accept=".csv,.xlsx"
                required
                onChange={(e) => {
                  setFichier(e.target.files?.[0] ?? null);
                  setResultat(null);
                }}
                className="text-sm"
              />
            </div>
            <div role="status" aria-live="polite" className="flex flex-col gap-2 text-sm">
              {erreur ? <p className="text-bad">{erreur}</p> : null}
              {resultat ? (
                <>
                  <p className={resultat.erreurs.length ? 'text-bad' : ''}>
                    {resultat.importe
                      ? t.importe(nombres)
                      : resultat.erreurs.length
                        ? t.aCorriger(resultat.erreurs.length)
                        : t.pret(nombres)}
                  </p>
                  {resultat.erreurs.length > 0 ? (
                    <ul className="list-disc pl-5 text-bad">
                      {resultat.erreurs.map((e, i) => (
                        <li key={`${String(e.ligne)}-${String(i)}`}>
                          {e.ligne === null ? e.message : t.ligne(e.ligne, e.message)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {resultat.avertissements.length > 0 ? (
                    <ul className="list-disc pl-5 text-warn">
                      {resultat.avertissements.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fermer}>
                {resultat?.importe ? fr.referentiel.confirmer : fr.referentiel.annuler}
              </Button>
              {resultat && !resultat.importe && resultat.erreurs.length === 0 ? (
                <Button disabled={envoi} onClick={() => void deposer(false)}>
                  {t.importer}
                </Button>
              ) : !resultat?.importe ? (
                <Button type="submit" disabled={envoi || !fichier}>
                  {t.verifier}
                </Button>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
