'use client';

import {
  MODES_EVALUATION,
  MODES_VALIDATION,
  type Maquette,
  type RegleBibliotheque,
  type RegleParticuliere,
  type ResultatSimulation,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';
import { ChampsRegle, lireRegle, resumeRegle } from '../champs-regle';
import { chiffre, nombre, SELECT, texte, useEnvoi } from '../envoi';

const t = fr.referentiel;
const tr = t.regles;

interface RegleSaisie {
  cle: string;
  regleId: string | null;
  libelle: string;
  regle: RegleParticuliere;
}

/**
 * E-02-03 · Règles de validation (RG-02-07, RG-02-08, RG-02-24, RG-02-25), règles particulières
 * activées (RG-02-26 à RG-02-28) et simulateur (RG-02-10).
 */
export function EditeurRegles({
  maquette,
  bibliotheque,
}: {
  maquette: Maquette;
  bibliotheque: readonly RegleBibliotheque[];
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const [enregistre, setEnregistre] = useState(false);
  const [particulieres, setParticulieres] = useState<RegleSaisie[]>(
    maquette.reglesParticulieres.map((r) => ({
      cle: r.id,
      regleId: r.regleId,
      libelle: r.libelle,
      regle: r.regle,
    })),
  );
  const [edition, setEdition] = useState<RegleSaisie | null>(null);
  const ids = {
    mode: useId(),
    methode: useId(),
    evaluation: useId(),
    blocs: useId(),
    niveau: useId(),
    ajout: useId(),
  };
  const { regles } = maquette;
  const modifiable = maquette.modifiable;
  const mentions = [...regles.mentions, { libelle: '', seuil: 18 }];

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const corps = {
      regles: {
        mode: texte(d.get('mode')),
        seuil: nombre(d.get('seuil')),
        noteEliminatoire: nombre(d.get('noteEliminatoire')) ?? null,
        compensationModules: d.get('compensationModules') === 'on',
        compensationSemestres: d.get('compensationSemestres') === 'on',
        arrondi: { decimales: nombre(d.get('decimales')) ?? 2, methode: texte(d.get('methode')) },
        mentions: mentions
          .map((_, i) => ({
            libelle: texte(d.get(`mention-${String(i)}`)),
            seuil: nombre(d.get(`mention-seuil-${String(i)}`)),
          }))
          .filter((m) => m.libelle),
        modeEvaluation: texte(d.get('modeEvaluation')),
        validationBlocs: texte(d.get('validationBlocs')),
        regleNiveau: texte(d.get('regleNiveau')),
      },
      reglesParticulieres: particulieres.map(({ regleId, libelle, regle }) => ({
        regleId,
        libelle,
        regle,
      })),
    };
    const resultat = await executer(`/api/maquettes/${maquette.version.id}/regles`, 'PUT', corps);
    setEnregistre(resultat.ok);
  }

  function activer(id: string) {
    const source = bibliotheque.find((r) => r.id === id);
    if (!source) return;
    setParticulieres((liste) => [
      ...liste,
      {
        cle: crypto.randomUUID(),
        regleId: source.id,
        libelle: source.libelle,
        regle: source.regle,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-6" onSubmit={(event) => void onSubmit(event)}>
        <fieldset disabled={!modifiable} className="contents">
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{tr.titre}</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.mode}>{tr.mode}</Label>
              <select id={ids.mode} name="mode" defaultValue={regles.mode} className={SELECT}>
                {MODES_VALIDATION.map((m) => (
                  <option key={m} value={m}>
                    {tr.modes[m]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">{tr.aidesModes[regles.mode]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                nom="seuil"
                label={tr.seuil}
                erreurs={erreurs}
                type="number"
                step="0.01"
                min={0}
                max={20}
                defaultValue={regles.seuil}
                required
              />
              <Champ
                nom="noteEliminatoire"
                label={tr.noteEliminatoire}
                aide={tr.aideEliminatoire}
                erreurs={erreurs}
                type="number"
                step="0.01"
                min={0}
                max={20}
                defaultValue={regles.noteEliminatoire ?? ''}
              />
            </div>
            <div className="flex flex-col gap-2">
              {(['compensationModules', 'compensationSemestres'] as const).map((nom) => (
                <label key={nom} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                  <input
                    type="checkbox"
                    name={nom}
                    defaultChecked={regles[nom]}
                    className="size-4"
                  />
                  {tr[nom]}
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.methode}>{tr.arrondi}</Label>
                <select
                  id={ids.methode}
                  name="methode"
                  defaultValue={regles.arrondi.methode}
                  className={SELECT}
                >
                  {(['plus_proche', 'inferieur', 'superieur'] as const).map((m) => (
                    <option key={m} value={m}>
                      {tr.methodes[m]}
                    </option>
                  ))}
                </select>
              </div>
              <Champ
                nom="decimales"
                label={tr.decimales}
                erreurs={erreurs}
                type="number"
                min={0}
                max={3}
                defaultValue={regles.arrondi.decimales}
              />
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">{tr.mentions}</legend>
              {mentions.map((m, i) => (
                <div
                  key={`${m.libelle}-${String(i)}`}
                  role="group"
                  aria-label={tr.mention(i + 1)}
                  className="grid grid-cols-[1fr_8rem] gap-3"
                >
                  <Champ
                    nom={`mention-${String(i)}`}
                    label={tr.libelle}
                    erreurs={erreurs}
                    defaultValue={m.libelle}
                    maxLength={40}
                  />
                  <Champ
                    nom={`mention-seuil-${String(i)}`}
                    label={tr.seuilMention}
                    erreurs={erreurs}
                    type="number"
                    step="0.01"
                    min={0}
                    max={20}
                    defaultValue={m.seuil}
                  />
                </div>
              ))}
            </fieldset>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{tr.evaluation}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  [
                    ids.evaluation,
                    'modeEvaluation',
                    tr.evaluation,
                    MODES_EVALUATION,
                    tr.modesEvaluation,
                    regles.modeEvaluation,
                  ],
                  [
                    ids.blocs,
                    'validationBlocs',
                    tr.validationBlocs,
                    MODES_EVALUATION,
                    tr.modesEvaluation,
                    regles.validationBlocs,
                  ],
                  [
                    ids.niveau,
                    'regleNiveau',
                    tr.regleNiveau,
                    ['derniere', 'meilleur', 'frequent'] as const,
                    tr.reglesNiveau,
                    regles.regleNiveau,
                  ],
                ] as const
              ).map(([id, nom, libelle, valeurs, libelles, defaut]) => (
                <div key={nom} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>{libelle}</Label>
                  <select id={id} name={nom} defaultValue={defaut} className={SELECT}>
                    {valeurs.map((v) => (
                      <option key={v} value={v}>
                        {(libelles as Record<string, string>)[v]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{tr.particulieres}</h2>
              <p className="text-sm text-muted">{tr.aideParticulieres}</p>
            </div>
            {particulieres.length === 0 ? (
              <p className="text-sm text-muted">{tr.aucuneParticuliere}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {particulieres.map((r) => (
                <li
                  key={r.cle}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2"
                >
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="accent">{t.typesRegle[r.regle.type]}</Badge>
                    <span className="font-medium">{r.libelle}</span>
                    <span className="text-muted">{resumeRegle(r.regle)}</span>
                  </p>
                  {modifiable ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        aria-label={t.maquette.modifierElement(r.libelle)}
                        onClick={() => {
                          setEdition(r);
                        }}
                      >
                        {t.modifier}
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={tr.retirer(r.libelle)}
                        onClick={() => {
                          setParticulieres((l) => l.filter((x) => x.cle !== r.cle));
                        }}
                      >
                        {t.supprimer}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {modifiable && bibliotheque.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.ajout}>{tr.activer}</Label>
                <select
                  id={ids.ajout}
                  value=""
                  onChange={(e) => {
                    activer(e.target.value);
                  }}
                  className={SELECT}
                >
                  <option value="">{tr.choisir}</option>
                  {bibliotheque.map((r) => (
                    <option key={r.id} value={r.id}>
                      {`${r.libelle} · ${t.typesRegle[r.regle.type]}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </Card>
        </fieldset>
        <MessageErreur erreurs={erreurs} champs={['seuil', 'noteEliminatoire']} />
        {enregistre ? (
          <p role="status" className="text-sm text-ok">
            {tr.enregistrees}
          </p>
        ) : null}
        {modifiable ? (
          <Button type="submit" className="self-start" disabled={envoi}>
            {tr.enregistrer}
          </Button>
        ) : null}
      </form>

      <Simulateur maquette={maquette} />

      {edition ? (
        <EditionRegle
          regle={edition}
          maquette={maquette}
          onFermer={() => {
            setEdition(null);
          }}
          onValider={(modifiee) => {
            setParticulieres((l) => l.map((x) => (x.cle === modifiee.cle ? modifiee : x)));
            setEdition(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Surcharge des paramètres d'une règle activée, pour cette version seulement (RG-02-26). */
function EditionRegle({
  regle,
  maquette,
  onFermer,
  onValider,
}: {
  regle: RegleSaisie;
  maquette: Maquette;
  onFermer: () => void;
  onValider: (regle: RegleSaisie) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent
        title={t.maquette.modifierElement(regle.libelle)}
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
      >
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const d = new FormData(event.currentTarget);
            onValider({
              ...regle,
              libelle: texte(d.get('libelle')) || regle.libelle,
              regle: lireRegle(d) as RegleParticuliere,
            });
          }}
        >
          <Champ
            nom="libelle"
            label={t.ecole.parametres.libelle}
            erreurs={{ message: null, details: [] }}
            defaultValue={regle.libelle}
            required
            maxLength={120}
          />
          <ChampsRegle
            regle={regle.regle}
            erreurs={{ message: null, details: [] }}
            cibles={{ ues: maquette.ues, modules: maquette.modules }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit">{t.confirmer}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** RG-02-10 : notes fictives, résultat calculé par le moteur des bulletins, rien n'est enregistré. */
function Simulateur({ maquette }: { maquette: Maquette }) {
  const ts = t.simulateur;
  const [annee, setAnnee] = useState(1);
  const [resultat, setResultat] = useState<ResultatSimulation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const idAnnee = useId();
  const idOption = useId();
  const ues = maquette.ues.filter((u) => u.annee === annee);
  const modules = maquette.modules.filter((m) => ues.some((u) => u.id === m.ueId));
  const options = [...new Set(ues.flatMap((u) => u.option ?? []))];
  const annees = [...new Set(maquette.ues.map((u) => u.annee))].sort();

  async function simuler(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const reponse = await envoyer(
      `/api/maquettes/${maquette.version.id}/simulation`,
      'POST',
      {
        annee,
        option: texte(d.get('option')) || null,
        evaluations: modules.flatMap((m) => {
          const note = nombre(d.get(`note-${m.id}`));
          return note === undefined ? [] : [{ moduleId: m.id, note }];
        }),
      },
      t.erreur,
    );
    if (!reponse.ok) {
      setErreur(reponse.erreur);
      return;
    }
    setErreur(null);
    setResultat(reponse.body as ResultatSimulation);
  }

  const etatUe = (u: ResultatSimulation['ues'][number]) =>
    u.acquise === null
      ? ts.attente
      : !u.acquise
        ? ts.nonAcquise
        : u.par === 'compensation'
          ? ts.compensee
          : ts.acquise;
  const moyenne = (n: number | null) => (n === null ? '–' : chiffre(n));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{ts.titre}</h2>
        <p className="text-sm text-muted">{ts.aide}</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void simuler(event)}>
        <div className="flex flex-wrap gap-4">
          {annees.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idAnnee}>{ts.annee}</Label>
              <select
                id={idAnnee}
                value={annee}
                onChange={(e) => {
                  setAnnee(Number(e.target.value));
                  setResultat(null);
                }}
                className={SELECT}
              >
                {annees.map((a) => (
                  <option key={a} value={a}>
                    {t.maquette.annee(a)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {options.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idOption}>{t.maquette.option}</Label>
              <select id={idOption} name="option" className={SELECT}>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Champ
              key={m.id}
              nom={`note-${m.id}`}
              label={ts.note(`${m.code} ${m.intitule}`)}
              erreurs={{ message: null, details: [] }}
              type="number"
              step="0.01"
              min={0}
              max={20}
            />
          ))}
        </div>
        <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
          {erreur}
        </p>
        <Button type="submit" variant="secondary" className="self-start">
          {ts.simuler}
        </Button>
      </form>
      {resultat ? (
        <section aria-label={ts.resultat} className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">{ts.moyenneGenerale}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {moyenne(resultat.moyenneGenerale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{ts.resultat}</dt>
              <dd className="text-lg font-semibold">
                {resultat.admis === null ? ts.attente : resultat.admis ? ts.admis : ts.ajourne}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{ts.mention}</dt>
              <dd className="text-lg font-semibold">{resultat.mention ?? '–'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{ts.ects}</dt>
              <dd className="text-lg font-semibold tabular-nums">{chiffre(resultat.ects)}</dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{ts.resultat}</caption>
              <thead className="text-left text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t.maquette.ue}
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    {ts.moyenne}
                  </th>
                  <th scope="col" className="px-2 py-1 font-medium">
                    {ts.resultat}
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultat.ues.map((u) => {
                  const ue = maquette.ues.find((x) => x.id === u.id);
                  return (
                    <tr key={u.id} className="border-t border-line">
                      <th
                        scope="row"
                        className="py-1 pr-3 text-left font-normal"
                      >{`${ue?.code ?? ''} · ${ue?.intitule ?? ''}`}</th>
                      <td className="px-2 py-1 text-right tabular-nums">{moyenne(u.moyenne)}</td>
                      <td className="px-2 py-1">
                        {u.eliminatoire ? `${etatUe(u)} · ${ts.eliminatoire}` : etatUe(u)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {resultat.explications.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {resultat.explications.map((e, i) => (
                <li key={`${e.regleId}-${String(i)}`}>
                  {ts.regle(e.libelle, chiffre(e.avant), chiffre(e.apres))}
                </li>
              ))}
            </ul>
          ) : null}
          {resultat.anomalies.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-warn">
              {resultat.anomalies.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </Card>
  );
}
