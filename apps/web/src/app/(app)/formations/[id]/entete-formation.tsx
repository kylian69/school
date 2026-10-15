'use client';

import type { Etablissement, Formation } from '@scolaly/contracts';
import { Badge, Button, Dialog, DialogContent } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { texte, useEnvoi } from '../envoi';
import { FormationDialog } from '../formulaire-formation';

const t = fr.referentiel;

/** En-tête d'une formation : description, modification, duplication (US-02-04) et archivage. */
export function EnteteFormation({
  formation,
  etablissements,
}: {
  formation: Formation;
  etablissements: readonly Etablissement[];
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [duplication, setDuplication] = useState(false);
  const statut = useEnvoi();
  const copie = useEnvoi();

  async function dupliquer(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const intitule = texte(new FormData(event.currentTarget).get('intitule'));
    const resultat = await copie.executer(`/api/formations/${formation.id}/duplication`, 'POST', {
      intitule,
    });
    if (!resultat.ok) return;
    setDuplication(false);
    router.push(`/formations/${(resultat.body as Formation).id}`);
  }

  const nomEtablissement = (id: string) => etablissements.find((e) => e.id === id)?.nom;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        <Link href="/formations" className="underline-offset-4 hover:underline">
          {t.filAriane}
        </Link>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
            {formation.intitule}
          </h1>
          <p className="text-sm text-muted">
            {[
              t.types[formation.type],
              t.niveau(formation.niveau),
              t.duree(formation.dureeAnnees),
              formation.codeRncp,
              ...formation.etablissementIds.map(nomEtablissement),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {formation.statut === 'archivee' ? <Badge>{t.statutsFormation.archivee}</Badge> : null}
            {formation.modes.map((m) => (
              <Badge key={m} tone="accent">
                {t.modes[m]}
              </Badge>
            ))}
          </div>
        </div>
        {formation.modifiable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEdition(true);
              }}
            >
              {t.modifier}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDuplication(true);
              }}
            >
              {t.dupliquer}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void statut.executer(`/api/formations/${formation.id}`, 'PATCH', {
                  statut: formation.statut === 'active' ? 'archivee' : 'active',
                })
              }
            >
              {formation.statut === 'active' ? t.archiver : t.reactiver}
            </Button>
          </div>
        ) : (
          <p className="max-w-xs text-sm text-muted">{t.lectureSeule}</p>
        )}
      </div>
      <MessageErreur erreurs={statut.erreurs} />
      <EmargementFormation formation={formation} />

      <FormationDialog
        ouvert={edition}
        formation={formation}
        etablissements={etablissements}
        onFermer={() => {
          setEdition(false);
        }}
      />
      <Dialog
        open={duplication}
        onOpenChange={(open) => {
          if (!open) setDuplication(false);
        }}
      >
        <DialogContent title={t.dupliquerTitre}>
          <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void dupliquer(event)}>
            <p className="text-sm text-muted">{t.aideDuplication}</p>
            <Champ
              nom="intitule"
              label={t.champs.intitule}
              erreurs={copie.erreurs}
              defaultValue={t.intituleCopie(formation.intitule)}
              required
              maxLength={200}
            />
            <MessageErreur erreurs={copie.erreurs} champs={['intitule']} />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDuplication(false);
                }}
              >
                {t.annuler}
              </Button>
              <Button type="submit" disabled={copie.envoi}>
                {t.dupliquer}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** RG-06-09 : contrôle de localisation à l'émargement, désactivable pour la formation. */
function EmargementFormation({ formation }: { formation: Formation }) {
  const te = t.emargement;
  const reglage = useEnvoi();
  const [active, setActive] = useState(formation.emargement.localisation);
  if (!formation.emargement.parametrable) {
    return (
      <p className="text-sm text-muted">
        {formation.emargement.localisation ? te.active : te.inactive}
      </p>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2 rounded-control border border-line p-4">
      <legend className="px-1 text-sm font-semibold">{te.titre}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
        <input
          type="checkbox"
          checked={active}
          disabled={reglage.envoi}
          onChange={(event) => {
            const demande = event.currentTarget.checked;
            setActive(demande);
            void reglage
              .executer(`/api/formations/${formation.id}/emargement`, 'PUT', {
                localisation: demande,
              })
              .then((resultat) => {
                if (!resultat.ok) setActive(!demande);
              });
          }}
          className="size-4"
        />
        {te.localisation}
      </label>
      <p className="text-xs text-muted">{te.aide}</p>
      <MessageErreur erreurs={reglage.erreurs} />
    </fieldset>
  );
}
