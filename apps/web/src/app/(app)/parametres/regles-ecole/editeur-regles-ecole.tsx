'use client';

import type { EchelleMaitrise, RegleBibliotheque } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent } from '@scolaly/ui';
import { useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { ChampsRegle, lireRegle, resumeRegle } from '../../formations/champs-regle';
import { nombre, texte, useEnvoi } from '../../formations/envoi';

const t = fr.referentiel;
const te = t.ecole;

interface NiveauSaisi {
  cle: string;
  libelle: string;
  couleur: string;
  valeur: number | null;
  valide: boolean;
}

/** Échelle de maîtrise (RG-02-22) et bibliothèque des règles particulières (RG-02-26). */
export function EditeurReglesEcole({
  echelle,
  regles,
}: {
  echelle: EchelleMaitrise;
  regles: readonly RegleBibliotheque[];
}) {
  const echelleEnvoi = useEnvoi();
  const regleEnvoi = useEnvoi();
  const [enregistre, setEnregistre] = useState(false);
  const [niveaux, setNiveaux] = useState<NiveauSaisi[]>(
    echelle.niveaux.map((n) => ({
      cle: n.id,
      libelle: n.libelle,
      couleur: n.couleur,
      valeur: n.valeur,
      valide: n.valide,
    })),
  );
  const [edition, setEdition] = useState<RegleBibliotheque | 'nouvelle' | null>(null);

  async function enregistrerEchelle(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await echelleEnvoi.executer('/api/referentiel/echelle', 'PUT', {
      niveaux: niveaux.map((n) => ({
        libelle: texte(d.get(`libelle-${n.cle}`)),
        couleur: texte(d.get(`couleur-${n.cle}`)),
        valeur: nombre(d.get(`valeur-${n.cle}`)) ?? null,
        valide: d.get(`valide-${n.cle}`) === 'on',
      })),
    });
    setEnregistre(resultat.ok);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form className="flex flex-col gap-4" onSubmit={(event) => void enregistrerEchelle(event)}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{te.echelle}</h2>
            <p className="text-sm text-muted">{te.aideEchelle}</p>
            {echelle.parDefaut ? <p className="text-sm text-warn">{te.parDefaut}</p> : null}
          </div>
          <ol className="flex flex-col gap-3">
            {niveaux.map((n, rang) => (
              <li key={n.cle}>
                <fieldset className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_8rem_auto_auto]">
                  <legend className="sr-only">{te.niveau(rang + 1)}</legend>
                  <Champ
                    nom={`libelle-${n.cle}`}
                    label={`${te.niveau(rang + 1)} · ${t.regles.libelle}`}
                    erreurs={echelleEnvoi.erreurs}
                    defaultValue={n.libelle}
                    required
                    maxLength={60}
                  />
                  <Champ
                    nom={`couleur-${n.cle}`}
                    label={te.couleur}
                    erreurs={echelleEnvoi.erreurs}
                    type="color"
                    defaultValue={n.couleur}
                  />
                  <Champ
                    nom={`valeur-${n.cle}`}
                    label={te.valeur}
                    erreurs={echelleEnvoi.erreurs}
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={n.valeur ?? ''}
                  />
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`valide-${n.cle}`}
                      defaultChecked={n.valide}
                      className="size-4"
                    />
                    {te.valide}
                  </label>
                  <Button
                    variant="ghost"
                    aria-label={te.retirerNiveau(rang + 1)}
                    disabled={niveaux.length <= 2}
                    onClick={() => {
                      setNiveaux((liste) => liste.filter((x) => x.cle !== n.cle));
                    }}
                  >
                    {t.supprimer}
                  </Button>
                </fieldset>
              </li>
            ))}
          </ol>
          <MessageErreur erreurs={echelleEnvoi.erreurs} />
          {enregistre ? (
            <p role="status" className="text-sm text-ok">
              {te.enregistre}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={niveaux.length >= 8}
              onClick={() => {
                setNiveaux((liste) => [
                  ...liste,
                  {
                    cle: crypto.randomUUID(),
                    libelle: '',
                    couleur: '#4F46E5',
                    valeur: null,
                    valide: false,
                  },
                ]);
              }}
            >
              {te.ajouterNiveau}
            </Button>
            <Button type="submit" disabled={echelleEnvoi.envoi}>
              {te.enregistrerEchelle}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{te.bibliotheque}</h2>
            <p className="text-sm text-muted">{te.aideBibliotheque}</p>
          </div>
          <Button
            onClick={() => {
              setEdition('nouvelle');
            }}
          >
            {te.ajouterRegle}
          </Button>
        </div>
        <MessageErreur erreurs={regleEnvoi.erreurs} />
        {regles.length === 0 ? <p className="text-sm text-muted">{te.aucune}</p> : null}
        <ul className="flex flex-col gap-2">
          {regles.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="accent">{t.typesRegle[r.regle.type]}</Badge>
                <span className="font-medium">{r.libelle}</span>
                <span className="text-muted">{resumeRegle(r.regle)}</span>
              </p>
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
                  aria-label={t.maquette.supprimerElement(r.libelle)}
                  onClick={() =>
                    void regleEnvoi.executer(`/api/referentiel/regles/${r.id}`, 'DELETE')
                  }
                >
                  {t.supprimer}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {edition ? (
        <RegleDialog
          regle={edition === 'nouvelle' ? undefined : edition}
          onFermer={() => {
            setEdition(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RegleDialog({
  regle,
  onFermer,
}: {
  regle: RegleBibliotheque | undefined;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const corps = { libelle: texte(d.get('libelle')), regle: lireRegle(d) };
    const resultat = regle
      ? await executer(`/api/referentiel/regles/${regle.id}`, 'PUT', corps)
      : await executer('/api/referentiel/regles', 'POST', corps);
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
        title={regle ? te.modifierRegle : te.nouvelleRegle}
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <Champ
            nom="libelle"
            label={te.parametres.libelle}
            erreurs={erreurs}
            defaultValue={regle?.libelle}
            required
            maxLength={120}
          />
          <ChampsRegle {...(regle ? { regle: regle.regle } : {})} erreurs={erreurs} />
          <MessageErreur erreurs={erreurs} champs={['libelle']} />
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
