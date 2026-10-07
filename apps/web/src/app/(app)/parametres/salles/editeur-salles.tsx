'use client';

import { TYPES_SALLE, type Etablissement, type ListeSalles, type Salle } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { nombre, SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.salles;

export function EditeurSalles({
  liste,
  filtres,
  etablissements,
}: {
  liste: ListeSalles;
  filtres: { etablissementId?: string; capaciteMin?: string; equipement?: string };
  etablissements: readonly Etablissement[];
}) {
  const [edition, setEdition] = useState<Salle | 'nouvelle' | null>(null);
  const { erreurs, executer } = useEnvoi();
  const ids = { etab: useId(), capacite: useId(), equipement: useId() };
  const nomEtablissement = (id: string) => etablissements.find((e) => e.id === id)?.nom ?? '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          role="search"
          className="flex flex-wrap items-end gap-3"
          action="/parametres/salles"
          method="get"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.etab}>{t.etablissement}</Label>
            <select
              id={ids.etab}
              name="etablissementId"
              defaultValue={filtres.etablissementId ?? ''}
              className={SELECT}
            >
              <option value="">{t.tous}</option>
              {etablissements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <Label htmlFor={ids.capacite}>{t.capaciteMin}</Label>
            <Input
              id={ids.capacite}
              name="capaciteMin"
              type="number"
              min={1}
              defaultValue={filtres.capaciteMin ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.equipement}>{t.equipement}</Label>
            <Input id={ids.equipement} name="equipement" defaultValue={filtres.equipement ?? ''} />
          </div>
          <Button type="submit" variant="secondary">
            {t.filtrer}
          </Button>
        </form>
        {liste.creation ? (
          <Button
            onClick={() => {
              setEdition('nouvelle');
            }}
          >
            {t.nouvelle}
          </Button>
        ) : null}
      </div>
      <MessageErreur erreurs={erreurs} />
      {liste.salles.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {liste.salles.map((s) => (
            <li key={s.id}>
              <Card className="flex h-full flex-col gap-2">
                <h2 className="font-semibold">{s.nom}</h2>
                <p className="text-sm text-muted">
                  {[nomEtablissement(s.etablissementId), t.types[s.type]]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.capacite ? <Badge tone="accent">{t.places(s.capacite)}</Badge> : null}
                  {s.pmr ? <Badge tone="ok">{t.pmr}</Badge> : null}
                  {s.statut === 'fermee' ? <Badge tone="bad">{t.fermee}</Badge> : null}
                  {s.equipements.map((e) => (
                    <Badge key={e}>{e}</Badge>
                  ))}
                </div>
                {s.modifiable ? (
                  <div className="mt-auto flex gap-1">
                    <Button
                      variant="ghost"
                      aria-label={`${t.modifier} ${s.nom}`}
                      onClick={() => {
                        setEdition(s);
                      }}
                    >
                      {t.modifier}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`${s.statut === 'fermee' ? t.rouvrir : t.fermer} ${s.nom}`}
                      onClick={() =>
                        void executer(`/api/salles/${s.id}`, 'PATCH', {
                          statut: s.statut === 'fermee' ? 'disponible' : 'fermee',
                        })
                      }
                    >
                      {s.statut === 'fermee' ? t.rouvrir : t.fermer}
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {edition ? (
        <SalleDialog
          salle={edition === 'nouvelle' ? undefined : edition}
          etablissements={etablissements}
          onFermer={() => {
            setEdition(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SalleDialog({
  salle,
  etablissements,
  onFermer,
}: {
  salle: Salle | undefined;
  etablissements: readonly Etablissement[];
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { etab: useId(), type: useId() };
  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const corps = {
      nom: texte(d.get('nom')),
      capacite: nombre(d.get('capacite')) ?? null,
      type: texte(d.get('type')),
      equipements: texte(d.get('equipements'))
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      pmr: d.get('pmr') === 'on',
    };
    const r = salle
      ? await executer(`/api/salles/${salle.id}`, 'PATCH', corps)
      : await executer('/api/salles', 'POST', {
          ...corps,
          etablissementId: texte(d.get('etablissementId')),
        });
    if (r.ok) onFermer();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent
        title={salle ? t.modifier : t.nouvelle}
        className="max-h-[85vh] max-w-xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          {salle ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.etab}>{t.etablissement}</Label>
              <select id={ids.etab} name="etablissementId" className={SELECT}>
                {etablissements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Champ
            nom="nom"
            label={t.nom}
            erreurs={erreurs}
            defaultValue={salle?.nom}
            required
            maxLength={80}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              nom="capacite"
              label={t.capacite}
              erreurs={erreurs}
              type="number"
              min={1}
              defaultValue={salle?.capacite ?? ''}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.type}>{t.type}</Label>
              <select
                id={ids.type}
                name="type"
                defaultValue={salle?.type ?? 'cours'}
                className={SELECT}
              >
                {TYPES_SALLE.map((x) => (
                  <option key={x} value={x}>
                    {t.types[x]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Champ
            nom="equipements"
            label={t.equipements}
            erreurs={erreurs}
            defaultValue={salle?.equipements.join(', ') ?? ''}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pmr"
              defaultChecked={salle?.pmr ?? false}
              className="size-4"
            />
            {t.pmr}
          </label>
          <MessageErreur erreurs={erreurs} champs={['nom', 'capacite', 'equipements']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {fr.scolarite.annuler}
            </Button>
            <Button type="submit" disabled={envoi}>
              {fr.scolarite.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
