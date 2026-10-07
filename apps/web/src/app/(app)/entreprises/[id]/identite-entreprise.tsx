'use client';

import type { Entreprise, Opco } from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.entreprises;

/** Identité de l'entreprise ; IDCC et OPCO modifiables (RG-03-02). */
export function IdentiteEntreprise({
  entreprise,
  opcos,
}: {
  entreprise: Entreprise;
  opcos: readonly Opco[];
}) {
  const [edition, setEdition] = useState(false);
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { opco: useId(), statut: useId() };
  const libelleOpco = opcos.find((o) => o.code === entreprise.opco)?.libelle ?? entreprise.opco;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/entreprises/${entreprise.id}`, 'PATCH', {
      raisonSociale: texte(d.get('raisonSociale')),
      adresse: texte(d.get('adresse')) || null,
      codePostal: texte(d.get('codePostal')) || null,
      ville: texte(d.get('ville')) || null,
      idcc: texte(d.get('idcc')) || null,
      opco: texte(d.get('opco')) || null,
      statut: texte(d.get('statut')),
    });
    if (resultat.ok) setEdition(false);
  }

  const lignes: [string, string | null][] = [
    [
      t.champs.adresse,
      [entreprise.adresse, [entreprise.codePostal, entreprise.ville].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null,
    ],
    [t.champs.naf, entreprise.naf],
    [t.champs.effectif, entreprise.effectif],
    [t.champs.idcc, entreprise.idcc],
    [t.champs.opco, libelleOpco],
    [t.champs.statut, t.statuts[entreprise.statut]],
  ];

  return (
    <Card className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.fiche.identite}</h2>
        {entreprise.modifiable && !edition ? (
          <Button
            variant="secondary"
            onClick={() => {
              setEdition(true);
            }}
          >
            {t.fiche.modifier}
          </Button>
        ) : null}
      </div>
      {edition ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
          <Champ
            nom="raisonSociale"
            label={t.champs.raisonSociale}
            erreurs={erreurs}
            defaultValue={entreprise.raisonSociale}
            required
            maxLength={200}
          />
          <Champ
            nom="adresse"
            label={t.champs.adresse}
            erreurs={erreurs}
            defaultValue={entreprise.adresse ?? ''}
            maxLength={200}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              nom="codePostal"
              label={t.champs.codePostal}
              erreurs={erreurs}
              defaultValue={entreprise.codePostal ?? ''}
              maxLength={10}
            />
            <Champ
              nom="ville"
              label={t.champs.ville}
              erreurs={erreurs}
              defaultValue={entreprise.ville ?? ''}
              maxLength={80}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              nom="idcc"
              label={t.champs.idcc}
              aide={t.champs.idccAide}
              erreurs={erreurs}
              defaultValue={entreprise.idcc ?? ''}
              maxLength={10}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.opco}>{t.champs.opco}</Label>
              <select
                id={ids.opco}
                name="opco"
                defaultValue={entreprise.opco ?? ''}
                className={SELECT}
              >
                <option value="">{t.champs.aucunOpco}</option>
                {opcos.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.statut}>{t.champs.statut}</Label>
            <select
              id={ids.statut}
              name="statut"
              defaultValue={entreprise.statut}
              className={SELECT}
            >
              {(['active', 'fermee'] as const).map((s) => (
                <option key={s} value={s}>
                  {t.statuts[s]}
                </option>
              ))}
            </select>
          </div>
          <MessageErreur
            erreurs={erreurs}
            champs={['raisonSociale', 'adresse', 'codePostal', 'ville', 'idcc']}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setEdition(false);
              }}
            >
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {lignes.map(([libelle, valeur]) => (
            <div key={libelle} className="flex flex-col gap-0.5">
              <dt className="text-muted">{libelle}</dt>
              <dd>{valeur ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
