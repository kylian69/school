'use client';

import {
  TYPES_HEURES,
  type BlocMaquette,
  type Maquette,
  type ModuleMaquette,
  type UeMaquette,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { chiffre, nombre, SELECT, texte, useEnvoi } from '../envoi';

const t = fr.referentiel;
const tm = t.maquette;

type Edition =
  | { type: 'bloc'; element?: BlocMaquette }
  | { type: 'ue'; element?: UeMaquette }
  | { type: 'module'; element?: ModuleMaquette; ueId: string };
type Suppression = { type: 'blocs' | 'ues' | 'modules'; id: string; nom: string };

const libellePeriode = (annee: number, semestre: number | null) =>
  `${tm.annee(annee)} · ${semestre === null ? tm.annuelle : tm.semestre(annee, semestre)}`;

/**
 * E-02-02 · Éditeur de maquette : arbre blocs → UE → modules, totaux et avertissements recalculés
 * par l'API à chaque modification (RG-02-02, RG-02-03), déplacement par boutons.
 */
export function EditeurMaquette({ maquette }: { maquette: Maquette }) {
  const { erreurs, executer } = useEnvoi();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [suppression, setSuppression] = useState<Suppression | null>(null);
  const modifiable = maquette.modifiable;
  const base = `/api/maquettes/${maquette.version.id}`;
  const blocDe = (id: string | null) => maquette.blocs.find((b) => b.id === id);

  const ues = [...maquette.ues].sort((a, b) => a.ordre - b.ordre);
  const periodes = maquette.totaux.periodes;

  function deplacer(
    type: 'ues' | 'modules' | 'blocs',
    id: string,
    freres: { id: string }[],
    sens: -1 | 1,
  ) {
    const rang = freres.findIndex((f) => f.id === id);
    const cible = rang + sens;
    if (cible < 0 || cible >= freres.length) return;
    void executer(`${base}/${type}/${id}`, 'PATCH', { ordre: cible });
  }

  const Actions = ({
    type,
    id,
    nom,
    freres,
    onModifier,
  }: {
    type: 'ues' | 'modules' | 'blocs';
    id: string;
    nom: string;
    freres: { id: string }[];
    onModifier: () => void;
  }) =>
    modifiable ? (
      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={tm.monter(nom)}
          onClick={() => {
            deplacer(type, id, freres, -1);
          }}
        >
          <span aria-hidden="true">↑</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tm.descendre(nom)}
          onClick={() => {
            deplacer(type, id, freres, 1);
          }}
        >
          <span aria-hidden="true">↓</span>
        </Button>
        <Button variant="ghost" aria-label={tm.modifierElement(nom)} onClick={onModifier}>
          {t.modifier}
        </Button>
        <Button
          variant="ghost"
          aria-label={tm.supprimerElement(nom)}
          onClick={() => {
            setSuppression({ type, id, nom });
          }}
        >
          {t.supprimer}
        </Button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <Totaux maquette={maquette} />
      <MessageErreur erreurs={erreurs} />

      <section aria-labelledby="titre-blocs" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="titre-blocs" className="text-lg font-semibold">
              {tm.blocs}
            </h2>
            <p className="text-sm text-muted">{tm.aideBlocs}</p>
          </div>
          {modifiable ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEdition({ type: 'bloc' });
              }}
            >
              {tm.ajouterBloc}
            </Button>
          ) : null}
        </div>
        {maquette.blocs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {maquette.blocs.map((bloc) => (
              <li key={bloc.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="text-sm">
                    <span className="font-mono">{bloc.code}</span> · {bloc.intitule}
                    <span className="text-muted">
                      {' '}
                      · {tm.ectsTotal(chiffre(maquette.totaux.blocs[bloc.id]?.ects ?? 0))}
                    </span>
                  </p>
                  <Actions
                    type="blocs"
                    id={bloc.id}
                    nom={bloc.code}
                    freres={maquette.blocs}
                    onModifier={() => {
                      setEdition({ type: 'bloc', element: bloc });
                    }}
                  />
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="titre-ues" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="titre-ues" className="text-lg font-semibold">
            {t.vues.maquette}
          </h2>
          {modifiable ? (
            <Button
              onClick={() => {
                setEdition({ type: 'ue' });
              }}
            >
              {tm.ajouterUe}
            </Button>
          ) : null}
        </div>
        {ues.length === 0 ? <p className="text-sm text-muted">{tm.vide}</p> : null}
        {periodes.map((periode) => {
          const liste = ues.filter(
            (u) => u.annee === periode.annee && u.semestre === periode.semestre,
          );
          const titre = libellePeriode(periode.annee, periode.semestre);
          return (
            <section
              key={`${String(periode.annee)}-${String(periode.semestre)}`}
              aria-label={titre}
              className="flex flex-col gap-3"
            >
              <h3 className="text-base font-semibold">
                {titre}
                <span className="font-normal text-muted">
                  {' '}
                  · {tm.ectsTotal(chiffre(periode.ects))}
                </span>
              </h3>
              {liste.map((ue) => {
                const modules = maquette.modules
                  .filter((m) => m.ueId === ue.id)
                  .sort((a, b) => a.ordre - b.ordre);
                const nomUe = `${ue.code} ${ue.intitule}`;
                return (
                  <Card key={ue.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <h4 className="font-semibold">
                          <span className="font-mono">{ue.code}</span> · {ue.intitule}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="accent">
                            {tm.coefEcts(chiffre(ue.coefficient), chiffre(ue.ects))}
                          </Badge>
                          {blocDe(ue.blocId) ? <Badge>{blocDe(ue.blocId)?.code}</Badge> : null}
                          {ue.option ? (
                            <Badge tone="warn">{`${tm.option} : ${ue.option}`}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <Actions
                        type="ues"
                        id={ue.id}
                        nom={nomUe}
                        freres={ues}
                        onModifier={() => {
                          setEdition({ type: 'ue', element: ue });
                        }}
                      />
                    </div>
                    {modules.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">{nomUe}</caption>
                          <thead className="text-left text-muted">
                            <tr>
                              <th scope="col" className="py-1 pr-3 font-medium">
                                {tm.module}
                              </th>
                              <th scope="col" className="px-2 py-1 text-right font-medium">
                                {tm.coefficient}
                              </th>
                              {TYPES_HEURES.map((type) => (
                                <th
                                  key={type}
                                  scope="col"
                                  className="px-2 py-1 text-right font-medium"
                                >
                                  {tm.typesHeures[type]}
                                </th>
                              ))}
                              <th scope="col" className="px-2 py-1 text-right font-medium">
                                {tm.total}
                              </th>
                              {modifiable ? (
                                <th scope="col">
                                  <span className="sr-only">{t.modifier}</span>
                                </th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody>
                            {modules.map((m) => (
                              <tr key={m.id} className="border-t border-line">
                                <th scope="row" className="py-1 pr-3 text-left font-normal">
                                  <span className="font-mono">{m.code}</span> · {m.intitule}
                                </th>
                                <td className="px-2 py-1 text-right tabular-nums">
                                  {chiffre(m.coefficient)}
                                </td>
                                {TYPES_HEURES.map((type) => (
                                  <td key={type} className="px-2 py-1 text-right tabular-nums">
                                    {m.heures[type] ? chiffre(m.heures[type]) : '–'}
                                  </td>
                                ))}
                                <td className="px-2 py-1 text-right font-medium tabular-nums">
                                  {chiffre(TYPES_HEURES.reduce((s, type) => s + m.heures[type], 0))}
                                </td>
                                {modifiable ? (
                                  <td className="py-1 pl-2">
                                    <Actions
                                      type="modules"
                                      id={m.id}
                                      nom={`${m.code} ${m.intitule}`}
                                      freres={modules}
                                      onModifier={() => {
                                        setEdition({ type: 'module', element: m, ueId: ue.id });
                                      }}
                                    />
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {modifiable ? (
                      <Button
                        variant="secondary"
                        className="self-start"
                        aria-label={`${tm.ajouterModule} · ${ue.code}`}
                        onClick={() => {
                          setEdition({ type: 'module', ueId: ue.id });
                        }}
                      >
                        {tm.ajouterModule}
                      </Button>
                    ) : null}
                  </Card>
                );
              })}
            </section>
          );
        })}
      </section>

      {edition ? (
        <EditionDialog
          edition={edition}
          maquette={maquette}
          onFermer={() => {
            setEdition(null);
          }}
        />
      ) : null}
      <Dialog
        open={suppression !== null}
        onOpenChange={(open) => {
          if (!open) setSuppression(null);
        }}
      >
        <DialogContent title={tm.supprimerElement(suppression?.nom ?? '')}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{tm.confirmerSuppression(suppression?.nom ?? '')}</p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSuppression(null);
                }}
              >
                {t.annuler}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!suppression) return;
                  void executer(`${base}/${suppression.type}/${suppression.id}`, 'DELETE').then(
                    () => {
                      setSuppression(null);
                    },
                  );
                }}
              >
                {t.supprimer}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Totaux et points à vérifier (RG-02-03), recalculés à chaque modification. */
function Totaux({ maquette }: { maquette: Maquette }) {
  const { totaux } = maquette;
  const code = (ueId: string) => maquette.ues.find((u) => u.id === ueId)?.code ?? '';
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{tm.totaux}</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {TYPES_HEURES.map((type) => (
          <div key={type} className="flex flex-col">
            <dt className="text-xs text-muted">{tm.typesHeures[type]}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {tm.heuresTotal(chiffre(totaux.heures[type]))}
            </dd>
          </div>
        ))}
        <div className="flex flex-col">
          <dt className="text-xs text-muted">{tm.heures}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {tm.heuresTotal(chiffre(totaux.heuresTotal))}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs text-muted">{tm.ects}</dt>
          <dd className="text-lg font-semibold tabular-nums">{chiffre(totaux.ects)}</dd>
        </div>
      </dl>
      {maquette.avertissements.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-warn">{tm.avertissements}</h3>
          <ul className="list-disc pl-5 text-sm">
            {maquette.avertissements.map((a) => (
              <li key={JSON.stringify(a)}>
                {a.type === 'semestre-ects'
                  ? tm.semestreEcts(
                      tm.semestre(a.annee, a.semestre),
                      chiffre(a.ects),
                      chiffre(a.attendu),
                    )
                  : a.type === 'ue-sans-module'
                    ? tm.ueSansModule(code(a.ueId) || a.code)
                    : tm.codeEnDouble(a.code)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/** Ajout ou modification d'un bloc, d'une UE ou d'un module. */
function EditionDialog({
  edition,
  maquette,
  onFermer,
}: {
  edition: Edition;
  maquette: Maquette;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { bloc: useId(), annee: useId(), periode: useId(), ue: useId() };
  const base = `/api/maquettes/${maquette.version.id}`;
  const titre = {
    bloc: edition.element ? tm.modifierBloc : tm.nouveauBloc,
    ue: edition.element ? tm.modifierUe : tm.nouvelleUe,
    module: edition.element ? tm.modifierModule : tm.nouveauModule,
  }[edition.type];

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const commun = { code: texte(d.get('code')), intitule: texte(d.get('intitule')) };
    let corps: Record<string, unknown> = commun;
    if (edition.type === 'ue') {
      const periode = texte(d.get('periode'));
      corps = {
        ...commun,
        blocId: texte(d.get('blocId')) || null,
        annee: nombre(d.get('annee')),
        semestre: periode === 'annee' ? null : Number(periode),
        ects: nombre(d.get('ects')) ?? 0,
        coefficient: nombre(d.get('coefficient')) ?? 1,
        option: texte(d.get('option')) || null,
      };
    } else if (edition.type === 'module') {
      corps = {
        ...commun,
        ueId: texte(d.get('ueId')) || edition.ueId,
        coefficient: nombre(d.get('coefficient')) ?? 1,
        heures: Object.fromEntries(TYPES_HEURES.map((type) => [type, nombre(d.get(type)) ?? 0])),
      };
    }
    const chemin = { bloc: 'blocs', ue: 'ues', module: 'modules' }[edition.type];
    const resultat = edition.element
      ? await executer(`${base}/${chemin}/${edition.element.id}`, 'PATCH', corps)
      : await executer(`${base}/${chemin}`, 'POST', corps);
    if (resultat.ok) onFermer();
  }

  const ue = edition.type === 'ue' ? edition.element : undefined;
  const moduleEdite = edition.type === 'module' ? edition.element : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={titre} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Champ
              nom="code"
              label={tm.code}
              erreurs={erreurs}
              defaultValue={edition.element?.code}
              required
              maxLength={30}
            />
            <Champ
              nom="intitule"
              label={tm.intitule}
              erreurs={erreurs}
              defaultValue={edition.element?.intitule}
              required
              maxLength={200}
            />
          </div>
          {edition.type === 'ue' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.bloc}>{tm.bloc}</Label>
                  <select
                    id={ids.bloc}
                    name="blocId"
                    defaultValue={ue?.blocId ?? ''}
                    className={SELECT}
                  >
                    <option value="">{tm.sansBloc}</option>
                    {maquette.blocs.map((b) => (
                      <option key={b.id} value={b.id}>
                        {`${b.code} · ${b.intitule}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.annee}>{tm.annee_}</Label>
                  <select
                    id={ids.annee}
                    name="annee"
                    defaultValue={ue?.annee ?? 1}
                    className={SELECT}
                  >
                    {Array.from({ length: maquette.formation.dureeAnnees }, (_, i) => i + 1).map(
                      (n) => (
                        <option key={n} value={n}>
                          {tm.annee(n)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.periode}>{tm.periode}</Label>
                  <select
                    id={ids.periode}
                    name="periode"
                    defaultValue={ue ? (ue.semestre === null ? 'annee' : String(ue.semestre)) : '1'}
                    className={SELECT}
                  >
                    <option value="1">{tm.semestre1}</option>
                    <option value="2">{tm.semestre2}</option>
                    <option value="annee">{tm.toute}</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Champ
                  nom="ects"
                  label={tm.ects}
                  erreurs={erreurs}
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={ue?.ects ?? 0}
                />
                <Champ
                  nom="coefficient"
                  label={tm.coefficient}
                  erreurs={erreurs}
                  type="number"
                  min={0}
                  step="0.001"
                  defaultValue={ue?.coefficient ?? 1}
                />
                <Champ
                  nom="option"
                  label={tm.option}
                  aide={tm.aideOption}
                  erreurs={erreurs}
                  defaultValue={ue?.option ?? ''}
                  maxLength={60}
                />
              </div>
            </>
          ) : null}
          {edition.type === 'module' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.ue}>{tm.ue}</Label>
                  <select
                    id={ids.ue}
                    name="ueId"
                    defaultValue={moduleEdite?.ueId ?? edition.ueId}
                    className={SELECT}
                  >
                    {maquette.ues.map((u) => (
                      <option key={u.id} value={u.id}>
                        {`${u.code} · ${u.intitule}`}
                      </option>
                    ))}
                  </select>
                </div>
                <Champ
                  nom="coefficient"
                  label={tm.coefficient}
                  erreurs={erreurs}
                  type="number"
                  min={0}
                  step="0.001"
                  defaultValue={moduleEdite?.coefficient ?? 1}
                />
              </div>
              <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <legend className="mb-2 text-sm font-medium">{tm.heures}</legend>
                {TYPES_HEURES.map((type) => (
                  <Champ
                    key={type}
                    nom={type}
                    label={tm.typesHeures[type]}
                    erreurs={erreurs}
                    type="number"
                    min={0}
                    step="0.25"
                    defaultValue={moduleEdite?.heures[type] ?? 0}
                  />
                ))}
              </fieldset>
            </>
          ) : null}
          <MessageErreur
            erreurs={erreurs}
            champs={['code', 'intitule', 'ects', 'coefficient', 'option']}
          />
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
