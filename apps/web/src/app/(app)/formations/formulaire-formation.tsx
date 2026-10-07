'use client';

import {
  MODES_FORMATION,
  TYPES_FORMATION,
  type Etablissement,
  type Formation,
} from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { nombre, SELECT, texte, useEnvoi } from './envoi';

const t = fr.referentiel;

/**
 * Création ou modification d'une formation (RG-02-01) : intitulé, type, niveau, code RNCP ou RS,
 * durée, modes autorisés et établissements où elle est dispensée.
 */
export function FormationDialog({
  ouvert,
  formation,
  etablissements,
  onFermer,
}: {
  ouvert: boolean;
  /** Formation à modifier ; absente pour une création. */
  formation?: Formation;
  etablissements: readonly Etablissement[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const { erreurs, setErreurs, envoi, executer } = useEnvoi();
  const idType = useId();
  const idNiveau = useId();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const donnees = new FormData(event.currentTarget);
    const corps = {
      intitule: texte(donnees.get('intitule')),
      type: texte(donnees.get('type')),
      niveau: nombre(donnees.get('niveau')),
      codeRncp: texte(donnees.get('codeRncp')),
      dureeAnnees: nombre(donnees.get('dureeAnnees')),
      modes: donnees.getAll('modes'),
      etablissementIds: donnees.getAll('etablissementIds'),
    };
    const resultat = formation
      ? await executer(`/api/formations/${formation.id}`, 'PATCH', corps)
      : await executer('/api/formations', 'POST', corps);
    if (!resultat.ok) return;
    onFermer();
    if (!formation) router.push(`/formations/${(resultat.body as Formation).id}`);
  }

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(open) => {
        if (!open) {
          setErreurs({ message: null, details: [] });
          onFermer();
        }
      }}
    >
      <DialogContent
        title={formation ? t.modifier : t.nouvelle}
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <Champ
            nom="intitule"
            label={t.champs.intitule}
            erreurs={erreurs}
            defaultValue={formation?.intitule}
            required
            maxLength={200}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idType}>{t.champs.type}</Label>
              <select id={idType} name="type" defaultValue={formation?.type} className={SELECT}>
                {TYPES_FORMATION.map((type) => (
                  <option key={type} value={type}>
                    {t.types[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idNiveau}>{t.champs.niveau}</Label>
              <select
                id={idNiveau}
                name="niveau"
                defaultValue={formation?.niveau ?? 6}
                className={SELECT}
              >
                {[5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {t.niveau(n)}
                  </option>
                ))}
              </select>
            </div>
            <Champ
              nom="dureeAnnees"
              label={t.champs.dureeAnnees}
              erreurs={erreurs}
              type="number"
              min={1}
              max={8}
              defaultValue={formation?.dureeAnnees ?? 2}
              required
            />
          </div>
          <Champ
            nom="codeRncp"
            label={t.champs.codeRncp}
            aide={t.champs.aideCodeRncp}
            erreurs={erreurs}
            defaultValue={formation?.codeRncp ?? ''}
            maxLength={20}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.champs.modes}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {MODES_FORMATION.map((mode) => (
                <label key={mode} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                  <input
                    type="checkbox"
                    name="modes"
                    value={mode}
                    defaultChecked={formation ? formation.modes.includes(mode) : mode === 'initial'}
                    className="size-4"
                  />
                  {t.modes[mode]}
                </label>
              ))}
            </div>
          </fieldset>
          {etablissements.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t.champs.etablissements}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {etablissements.map((e) => (
                  <label key={e.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                    <input
                      type="checkbox"
                      name="etablissementIds"
                      value={e.id}
                      defaultChecked={
                        formation
                          ? formation.etablissementIds.includes(e.id)
                          : etablissements.length === 1
                      }
                      className="size-4"
                    />
                    {e.nom}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <MessageErreur erreurs={erreurs} champs={['intitule', 'dureeAnnees', 'codeRncp']} />
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
