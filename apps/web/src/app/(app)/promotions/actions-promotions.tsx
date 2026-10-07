'use client';

import type {
  AnneeScolaire,
  DetailPromotion,
  Etablissement,
  Formation,
  ResultatPreparation,
} from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { nombre, SELECT, texte, useEnvoi } from '../formations/envoi';

const t = fr.scolarite;

/** Boutons « Nouvelle promotion » (RG-02-12) et « Préparer l'année suivante » (RG-02-20). */
export function ActionsPromotions({
  annee,
  annees,
  formations,
  etablissements,
}: {
  annee: AnneeScolaire;
  annees: readonly AnneeScolaire[];
  formations: readonly Formation[];
  etablissements: readonly Etablissement[];
}) {
  const [dialogue, setDialogue] = useState<'nouvelle' | 'preparation' | null>(null);
  const fermer = () => {
    setDialogue(null);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() => {
          setDialogue('preparation');
        }}
      >
        {t.preparer}
      </Button>
      <Button
        onClick={() => {
          setDialogue('nouvelle');
        }}
      >
        {t.nouvelle}
      </Button>
      {dialogue === 'nouvelle' ? (
        <NouvellePromotion
          annee={annee}
          formations={formations}
          etablissements={etablissements}
          onFermer={fermer}
        />
      ) : null}
      {dialogue === 'preparation' ? (
        <Preparation annee={annee} annees={annees} formations={formations} onFermer={fermer} />
      ) : null}
    </div>
  );
}

function NouvellePromotion({
  annee,
  formations,
  etablissements,
  onFermer,
}: {
  annee: AnneeScolaire;
  formations: readonly Formation[];
  etablissements: readonly Etablissement[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { formation: useId(), annee: useId(), etablissement: useId() };
  const [formationId, setFormationId] = useState(formations[0]?.id ?? '');
  const duree = formations.find((f) => f.id === formationId)?.dureeAnnees ?? 1;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer('/api/promotions', 'POST', {
      formationId,
      anneeFormation: nombre(d.get('anneeFormation')),
      anneeScolaireId: annee.id,
      etablissementId: texte(d.get('etablissementId')),
      ...(texte(d.get('libelle')) ? { libelle: texte(d.get('libelle')) } : {}),
    });
    if (resultat.ok) router.push(`/promotions/${(resultat.body as DetailPromotion).id}`);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={t.nouvelle} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <p className="text-sm text-muted">{annee.libelle}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.formation}>{t.champs.formation}</Label>
            <select
              id={ids.formation}
              value={formationId}
              onChange={(e) => {
                setFormationId(e.target.value);
              }}
              className={SELECT}
            >
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.intitule}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.annee}>{t.champs.anneeFormation}</Label>
              <select id={ids.annee} name="anneeFormation" className={SELECT}>
                {Array.from({ length: duree }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {t.anneeFormation(n)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.etablissement}>{t.champs.etablissement}</Label>
              <select id={ids.etablissement} name="etablissementId" className={SELECT}>
                {etablissements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Champ
            nom="libelle"
            label={t.champs.libelle}
            aide={t.champs.aideLibelle}
            erreurs={erreurs}
            maxLength={200}
          />
          <MessageErreur erreurs={erreurs} champs={['libelle']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi || !formationId}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Preparation({
  annee,
  annees,
  formations,
  onFermer,
}: {
  annee: AnneeScolaire;
  annees: readonly AnneeScolaire[];
  formations: readonly Formation[];
  onFermer: () => void;
}) {
  const tp = t.preparation;
  const router = useRouter();
  const { erreurs, envoi, executer } = useEnvoi();
  const idCible = useId();
  const suivantes = annees
    .filter((a) => a.dateDebut > annee.dateDebut)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  const [resultat, setResultat] = useState<ResultatPreparation | null>(null);

  async function envoyerPreparation(form: HTMLFormElement, apercu: boolean) {
    const d = new FormData(form);
    const reponse = await executer('/api/promotions/annee-suivante', 'POST', {
      anneeSourceId: annee.id,
      anneeCibleId: texte(d.get('anneeCibleId')),
      formationIds: d.getAll('formationIds'),
      apercu,
    });
    if (!reponse.ok) return;
    setResultat(reponse.body as ResultatPreparation);
    if (!apercu) router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={tp.titre} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void envoyerPreparation(event.currentTarget, true);
          }}
        >
          <p className="text-sm text-muted">{tp.aide}</p>
          {suivantes.length === 0 ? (
            <p role="alert" className="text-sm text-warn">
              {tp.sansAnnee}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idCible}>{tp.anneeCible}</Label>
              <select
                id={idCible}
                name="anneeCibleId"
                className={SELECT}
                onChange={() => {
                  setResultat(null);
                }}
              >
                {suivantes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
            </div>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{tp.formations}</legend>
            {formations.map((f) => (
              <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <input
                  type="checkbox"
                  name="formationIds"
                  value={f.id}
                  defaultChecked
                  className="size-4"
                  onChange={() => {
                    setResultat(null);
                  }}
                />
                {f.intitule}
              </label>
            ))}
          </fieldset>
          <MessageErreur erreurs={erreurs} />
          {resultat ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              {resultat.apercu ? null : <p className="text-ok">{tp.creees(resultat.creees)}</p>}
              <ul className="list-disc pl-5">
                {resultat.promotions.map((p) => (
                  <li key={p.sourceId}>
                    {tp.ligne(p.libelle, p.version, p.groupes, p.affectations)}
                    {p.existante ? ` · ${tp.existante}` : ''}
                    {p.affectationsIgnorees ? ` · ${tp.ignorees(p.affectationsIgnorees)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {resultat && !resultat.apercu ? t.confirmer : t.annuler}
            </Button>
            {resultat?.apercu ? (
              <Button
                disabled={envoi}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) void envoyerPreparation(form, false);
                }}
              >
                {tp.valider}
              </Button>
            ) : !resultat ? (
              <Button type="submit" disabled={envoi || suivantes.length === 0}>
                {tp.apercu}
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
