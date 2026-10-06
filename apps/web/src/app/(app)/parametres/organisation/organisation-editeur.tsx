'use client';

import type { Etablissement, OrganisationDetail } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type ComponentProps, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer, erreurDuChamp } from '@/lib/requete';

const t = fr.organisation;

interface Erreurs {
  message: string | null;
  details: readonly string[];
}
const SANS_ERREUR: Erreurs = { message: null, details: [] };

/** Champ de formulaire : libellé, saisie et erreur renvoyée par l'API pour ce champ. */
function Champ({
  nom,
  label,
  erreurs,
  aide,
  ...props
}: ComponentProps<'input'> & { nom: string; label: string; erreurs: Erreurs; aide?: string }) {
  const id = useId();
  const erreur = erreurDuChamp(erreurs.details, nom);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={nom}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur || aide ? `${id}-aide` : undefined}
        {...props}
      />
      {erreur || aide ? (
        <p id={`${id}-aide`} className={erreur ? 'text-sm text-bad' : 'text-xs text-muted'}>
          {erreur ?? aide}
        </p>
      ) : null}
    </div>
  );
}

/** Valeurs d'un formulaire, chaînes seulement. */
const valeurs = (form: HTMLFormElement) =>
  Object.fromEntries(
    [...new FormData(form)].map(([cle, valeur]) => [cle, typeof valeur === 'string' ? valeur : '']),
  );

export function OrganisationEditeur({
  organisation,
  modifiable,
}: {
  organisation: OrganisationDetail;
  /** Permission « organisation:modifier » : sinon, consultation seule. */
  modifiable: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState<Etablissement | 'nouveau' | null>(null);
  const [archivage, setArchivage] = useState<Etablissement | null>(null);
  const [erreurStatut, setErreurStatut] = useState<string | null>(null);

  async function changerStatut(etablissement: Etablissement, action: 'archivage' | 'reactivation') {
    const resultat = await envoyer(
      `/api/etablissements/${etablissement.id}/${action}`,
      'POST',
      undefined,
      t.erreur,
    );
    if (!resultat.ok) {
      setErreurStatut(resultat.erreur);
      return false;
    }
    setErreurStatut(null);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      {modifiable ? null : <p className="text-sm text-muted">{t.lectureSeule}</p>}
      <FicheOrganisation organisation={organisation} modifiable={modifiable} />

      <section aria-labelledby="titre-etablissements" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="titre-etablissements" className="text-lg font-semibold">
              {t.etablissements}
            </h2>
            <p className="max-w-2xl text-sm text-muted">{t.aideEtablissements}</p>
          </div>
          {modifiable ? (
            <Button
              onClick={() => {
                setEdition('nouveau');
              }}
            >
              {t.ajouter}
            </Button>
          ) : null}
        </div>
        <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
          {erreurStatut}
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {organisation.etablissements.map((etablissement) => (
            <li key={etablissement.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">{etablissement.nom}</h3>
                  <p className="text-sm text-muted">
                    {[
                      etablissement.adresseLigne1,
                      [etablissement.codePostal, etablissement.ville].filter(Boolean).join(' '),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={etablissement.statut === 'actif' ? 'ok' : 'neutral'}>
                    {etablissement.statut === 'actif' ? t.actif : t.archive}
                  </Badge>
                  {etablissement.manquantes.length === 0 ? (
                    <Badge tone="accent">{t.complet}</Badge>
                  ) : (
                    <Badge tone="warn">
                      {t.aCompleter(
                        etablissement.manquantes.map((m) => t.manquantes[m] ?? m).join(', '),
                      )}
                    </Badge>
                  )}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {(['uai', 'siret', 'nda'] as const).map((champ) =>
                    etablissement[champ] ? (
                      <div key={champ} className="contents">
                        <dt className="text-muted">{t.manquantes[champ]}</dt>
                        <dd className="font-mono">{etablissement[champ]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
                {modifiable ? (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      aria-label={`${t.modifier} ${etablissement.nom}`}
                      onClick={() => {
                        setEdition(etablissement);
                      }}
                    >
                      {t.modifier}
                    </Button>
                    {etablissement.statut === 'actif' ? (
                      <Button
                        variant="ghost"
                        aria-label={`${t.archiver} ${etablissement.nom}`}
                        onClick={() => {
                          setErreurStatut(null);
                          setArchivage(etablissement);
                        }}
                      >
                        {t.archiver}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        aria-label={`${t.reactiver} ${etablissement.nom}`}
                        onClick={() => void changerStatut(etablissement, 'reactivation')}
                      >
                        {t.reactiver}
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <EtablissementDialog
        edition={edition}
        onFermer={() => {
          setEdition(null);
        }}
        onEnregistre={() => {
          setEdition(null);
          router.refresh();
        }}
      />

      <Dialog
        open={archivage !== null}
        onOpenChange={(open) => {
          if (!open) setArchivage(null);
        }}
      >
        <DialogContent title={t.archiver}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{t.confirmerArchivage(archivage?.nom ?? '')}</p>
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
              {erreurStatut}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setArchivage(null);
                }}
              >
                {t.annuler}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!archivage) return;
                  void changerStatut(archivage, 'archivage').then((ok) => {
                    if (ok) setArchivage(null);
                  });
                }}
              >
                {t.archiver}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Nom, nom court et SIREN de l'école. */
function FicheOrganisation({
  organisation,
  modifiable,
}: {
  organisation: OrganisationDetail;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [enregistre, setEnregistre] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setEnvoi(true);
    const resultat = await envoyer(
      '/api/organisation',
      'PATCH',
      valeurs(event.currentTarget),
      t.erreur,
    );
    setEnvoi(false);
    setEnregistre(resultat.ok);
    setErreurs(resultat.ok ? SANS_ERREUR : { message: resultat.erreur, details: resultat.details });
    if (resultat.ok) router.refresh();
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <h2 className="text-lg font-semibold">{t.ecole}</h2>
        <fieldset disabled={!modifiable} className="grid gap-4 md:grid-cols-3">
          <Champ
            nom="nom"
            label={t.nom}
            erreurs={erreurs}
            defaultValue={organisation.nom}
            required
            maxLength={120}
          />
          <Champ
            nom="nomAffichage"
            label={t.nomAffichage}
            erreurs={erreurs}
            defaultValue={organisation.nomAffichage}
            required
            maxLength={40}
          />
          <Champ
            nom="siren"
            label={t.siren}
            erreurs={erreurs}
            aide={t.aideSiren}
            defaultValue={organisation.siren ?? ''}
            inputMode="numeric"
            maxLength={20}
          />
        </fieldset>
        <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
          {erreurs.message}
        </p>
        {modifiable ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={envoi}>
              {envoi ? t.enregistrement : t.enregistrer}
            </Button>
            <span role="status" className="text-sm text-ok">
              {enregistre ? t.enregistre : ''}
            </span>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

/** Création ou modification d'un établissement (US-01-02, RG-01-02). */
function EtablissementDialog({
  edition,
  onFermer,
  onEnregistre,
}: {
  edition: Etablissement | 'nouveau' | null;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const fuseauId = useId();
  const existant = edition === 'nouveau' ? null : edition;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const resultat = await envoyer(
      existant ? `/api/etablissements/${existant.id}` : '/api/etablissements',
      existant ? 'PATCH' : 'POST',
      valeurs(event.currentTarget),
      t.erreur,
    );
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      return;
    }
    setErreurs(SANS_ERREUR);
    onEnregistre();
  }

  const fuseaux = edition ? ['UTC', ...Intl.supportedValuesOf('timeZone')] : [];

  return (
    <Dialog
      open={edition !== null}
      onOpenChange={(open) => {
        if (!open) {
          setErreurs(SANS_ERREUR);
          onFermer();
        }
      }}
    >
      <DialogContent
        title={existant ? t.modification(existant.nom) : t.nouveau}
        className="top-[4vh] max-h-[92vh] max-w-2xl overflow-y-auto"
      >
        <form
          key={existant?.id ?? 'nouveau'}
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => void onSubmit(event)}
        >
          <Champ
            nom="nom"
            label={t.champs.nom}
            erreurs={erreurs}
            defaultValue={existant?.nom ?? ''}
            required
            maxLength={120}
          />
          <Champ
            nom="adresseLigne1"
            label={t.champs.adresseLigne1}
            erreurs={erreurs}
            defaultValue={existant?.adresseLigne1 ?? ''}
            required
            maxLength={200}
            autoComplete="address-line1"
          />
          <Champ
            nom="adresseLigne2"
            label={t.champs.adresseLigne2}
            erreurs={erreurs}
            defaultValue={existant?.adresseLigne2 ?? ''}
            maxLength={200}
            autoComplete="address-line2"
          />
          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <Champ
              nom="codePostal"
              label={t.champs.codePostal}
              erreurs={erreurs}
              defaultValue={existant?.codePostal ?? ''}
              required
              maxLength={10}
              autoComplete="postal-code"
            />
            <Champ
              nom="ville"
              label={t.champs.ville}
              erreurs={erreurs}
              defaultValue={existant?.ville ?? ''}
              required
              maxLength={120}
              autoComplete="address-level2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fuseauId}>{t.champs.fuseauHoraire}</Label>
            <select
              id={fuseauId}
              name="fuseauHoraire"
              defaultValue={existant?.fuseauHoraire ?? 'Europe/Paris'}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-fg md:h-10 md:text-sm"
            >
              {fuseaux.map((fuseau) => (
                <option key={fuseau} value={fuseau}>
                  {fuseau}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted">{t.aideIdentifiants}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <Champ
              nom="uai"
              label={t.champs.uai}
              erreurs={erreurs}
              defaultValue={existant?.uai ?? ''}
              maxLength={20}
            />
            <Champ
              nom="siret"
              label={t.champs.siret}
              erreurs={erreurs}
              defaultValue={existant?.siret ?? ''}
              inputMode="numeric"
              maxLength={20}
            />
            <Champ
              nom="nda"
              label={t.champs.nda}
              erreurs={erreurs}
              defaultValue={existant?.nda ?? ''}
              inputMode="numeric"
              maxLength={20}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ
              nom="telephone"
              label={t.champs.telephone}
              erreurs={erreurs}
              defaultValue={existant?.telephone ?? ''}
              type="tel"
              maxLength={30}
              autoComplete="tel"
            />
            <Champ
              nom="email"
              label={t.champs.email}
              erreurs={erreurs}
              defaultValue={existant?.email ?? ''}
              type="email"
              autoComplete="email"
            />
          </div>
          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
            {erreurs.message}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit">{t.valider}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
