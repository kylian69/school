'use client';

import type { Competence, Maquette } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { texte, useEnvoi } from '../envoi';
import { ImportMaquette } from './import-maquette';

const t = fr.referentiel;
const tc = t.competences;

type Edition = { blocId: string; competence?: Competence };

/**
 * E-02-09 · Référentiel de compétences : compétences de chaque bloc, critères d'évaluation et
 * modules où elles sont travaillées (RG-02-21, RG-02-23).
 */
export function EditeurCompetences({ maquette }: { maquette: Maquette }) {
  const { erreurs, executer } = useEnvoi();
  const [edition, setEdition] = useState<Edition | null>(null);
  const modifiable = maquette.modifiable;
  const codeModule = (id: string) => maquette.modules.find((m) => m.id === id)?.code ?? '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{tc.titre}</h2>
          <p className="text-sm text-muted">{tc.aide}</p>
        </div>
        {modifiable ? <ImportMaquette versionId={maquette.version.id} type="competences" /> : null}
      </div>
      <MessageErreur erreurs={erreurs} />
      {maquette.blocs.length === 0 ? <p className="text-sm text-muted">{tc.sansBloc}</p> : null}
      {maquette.blocs.map((bloc) => {
        const competences = maquette.competences
          .filter((c) => c.blocId === bloc.id)
          .sort((a, b) => a.ordre - b.ordre);
        return (
          <Card key={bloc.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                <span className="font-mono">{bloc.code}</span> · {bloc.intitule}
              </h3>
              {modifiable ? (
                <Button
                  variant="secondary"
                  aria-label={`${tc.ajouter} · ${bloc.code}`}
                  onClick={() => {
                    setEdition({ blocId: bloc.id });
                  }}
                >
                  {tc.ajouter}
                </Button>
              ) : null}
            </div>
            {competences.length === 0 ? <p className="text-sm text-muted">{tc.aucune}</p> : null}
            <ul className="flex flex-col gap-3">
              {competences.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 border-t border-line pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-mono">{c.code}</span> · {c.intitule}
                    </p>
                    {modifiable ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          aria-label={t.maquette.modifierElement(c.code)}
                          onClick={() => {
                            setEdition({ blocId: bloc.id, competence: c });
                          }}
                        >
                          {t.modifier}
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={t.maquette.supprimerElement(c.code)}
                          onClick={() =>
                            void executer(
                              `/api/maquettes/${maquette.version.id}/competences/${c.id}`,
                              'DELETE',
                            )
                          }
                        >
                          {t.supprimer}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {c.criteres.length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-muted">
                      {c.criteres.map((critere) => (
                        <li key={critere}>{critere}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {c.moduleIds.map((id) => (
                      <Badge key={id}>{codeModule(id)}</Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {edition ? (
        <CompetenceDialog
          edition={edition}
          maquette={maquette}
          onFermer={() => {
            setEdition(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CompetenceDialog({
  edition,
  maquette,
  onFermer,
}: {
  edition: Edition;
  maquette: Maquette;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const idCriteres = useId();
  const { competence } = edition;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const corps = {
      blocId: edition.blocId,
      code: texte(d.get('code')),
      intitule: texte(d.get('intitule')),
      criteres: texte(d.get('criteres'))
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      moduleIds: d.getAll('moduleIds'),
    };
    const base = `/api/maquettes/${maquette.version.id}/competences`;
    const resultat = competence
      ? await executer(`${base}/${competence.id}`, 'PATCH', corps)
      : await executer(base, 'POST', corps);
    if (resultat.ok) onFermer();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent
        title={competence ? tc.modifier : tc.nouvelle}
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Champ
              nom="code"
              label={t.maquette.code}
              erreurs={erreurs}
              defaultValue={competence?.code}
              required
              maxLength={30}
            />
            <Champ
              nom="intitule"
              label={t.maquette.intitule}
              erreurs={erreurs}
              defaultValue={competence?.intitule}
              required
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idCriteres}>{tc.criteres}</Label>
            <textarea
              id={idCriteres}
              name="criteres"
              rows={3}
              aria-describedby={`${idCriteres}-aide`}
              defaultValue={competence?.criteres.join('\n')}
              className="rounded-control border border-line bg-surface px-3 py-2 text-base md:text-sm"
            />
            <p id={`${idCriteres}-aide`} className="text-xs text-muted">
              {tc.aideCriteres}
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{tc.modules}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {maquette.modules.map((m) => (
                <label key={m.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                  <input
                    type="checkbox"
                    name="moduleIds"
                    value={m.id}
                    defaultChecked={competence?.moduleIds.includes(m.id)}
                    className="size-4"
                  />
                  {`${m.code} · ${m.intitule}`}
                </label>
              ))}
            </div>
          </fieldset>
          <MessageErreur erreurs={erreurs} champs={['code', 'intitule']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
