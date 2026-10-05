'use client';

import { FORMULES, type ClientFiche, type NouveauClient } from '@scolaly/contracts';
import { Button, Input, Label } from '@scolaly/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.console.nouveau;
const selectClass =
  'h-11 w-full rounded-control border border-line bg-surface px-3 text-sm md:h-10';

function Champ({
  id,
  label,
  aide,
  children,
}: {
  id: string;
  label: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {aide ? (
        <p id={`${id}-aide`} className="text-xs text-muted">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

const lire = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/** Erreurs renvoyées par l'API : message général et détails par champ (contrats Zod). */
function messagesDe(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [t.erreur];
  const { message, details } = body as { message?: unknown; details?: unknown };
  const lignes = Array.isArray(details)
    ? details.filter((d): d is string => typeof d === 'string')
    : [];
  return [typeof message === 'string' ? message : t.erreur, ...lignes];
}

export function NouveauClientForm() {
  const router = useRouter();
  const erreursId = useId();
  const [type, setType] = useState<NouveauClient['type']>('organisation');
  const [ecoles, setEcoles] = useState([0]);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const optionnel = (name: string) => lire(data, name) || undefined;
    const corps = {
      type,
      raisonSociale: lire(data, 'raisonSociale'),
      siren: optionnel('siren'),
      sousDomaine: lire(data, 'sousDomaine'),
      formule: lire(data, 'formule'),
      volumeApprenants: Number(lire(data, 'volumeApprenants')),
      dateDebut: lire(data, 'dateDebut'),
      dateFin: lire(data, 'dateFin'),
      referenceDevis: optionnel('referenceDevis'),
      administrateur: { nom: lire(data, 'adminNom'), email: lire(data, 'adminEmail') },
      ecoles: ecoles.map((n) => ({
        nom: lire(data, `ecole-${n}-nom`),
        nomAffichage: lire(data, `ecole-${n}-court`),
      })),
    };
    setEnvoi(true);
    setErreurs([]);
    try {
      const response = await fetch('/api/plateforme/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        router.push(`/plateforme/clients/${(body as ClientFiche).id}`);
        router.refresh();
        return;
      }
      setErreurs(messagesDe(body));
    } catch {
      setErreurs([fr.connexion.erreurs.reseau]);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => void onSubmit(event)} noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold">{t.type}</legend>
        <div className="flex flex-wrap gap-4">
          {(['organisation', 'groupe'] as const).map((valeur) => (
            <label key={valeur} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value={valeur}
                checked={type === valeur}
                onChange={() => {
                  setType(valeur);
                  if (valeur === 'organisation') setEcoles((liste) => liste.slice(0, 1));
                }}
                className="size-4 accent-accent"
              />
              {valeur === 'organisation' ? t.typeOrganisation : t.typeGroupe}
            </label>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Champ id="raisonSociale" label={t.raisonSociale}>
            <Input id="raisonSociale" name="raisonSociale" required autoComplete="organization" />
          </Champ>
          <Champ id="siren" label={t.siren}>
            <Input id="siren" name="siren" inputMode="numeric" pattern="\d{9}" />
          </Champ>
          <Champ id="sousDomaine" label={t.sousDomaine} aide={t.sousDomaineAide}>
            <Input
              id="sousDomaine"
              name="sousDomaine"
              required
              aria-describedby="sousDomaine-aide"
              className="font-mono"
            />
          </Champ>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">{t.contrat}</legend>
        <Champ id="formule" label={t.formule}>
          <select
            id="formule"
            name="formule"
            required
            className={selectClass}
            defaultValue="essentiel"
          >
            {FORMULES.map((formule) => (
              <option key={formule} value={formule}>
                {fr.console.formules[formule]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="volumeApprenants" label={t.volume}>
          <Input
            id="volumeApprenants"
            name="volumeApprenants"
            type="number"
            min={1}
            required
            className="num"
          />
        </Champ>
        <Champ id="dateDebut" label={t.debut}>
          <Input id="dateDebut" name="dateDebut" type="date" required />
        </Champ>
        <Champ id="dateFin" label={t.fin}>
          <Input id="dateFin" name="dateFin" type="date" required />
        </Champ>
        <Champ id="referenceDevis" label={t.devis}>
          <Input id="referenceDevis" name="referenceDevis" />
        </Champ>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">{t.administrateur}</legend>
        <p className="text-xs text-muted md:col-span-2">{t.administrateurAide}</p>
        <Champ id="adminNom" label={t.nom}>
          <Input id="adminNom" name="adminNom" required autoComplete="off" />
        </Champ>
        <Champ id="adminEmail" label={t.email}>
          <Input id="adminEmail" name="adminEmail" type="email" required autoComplete="off" />
        </Champ>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold">{t.ecoles}</legend>
        {ecoles.map((n, index) => (
          <div key={n} className="grid items-end gap-3 md:grid-cols-[1fr_180px_auto]">
            <Champ id={`ecole-${n}-nom`} label={`${t.ecoleNom} ${index + 1}`}>
              <Input id={`ecole-${n}-nom`} name={`ecole-${n}-nom`} required />
            </Champ>
            <Champ id={`ecole-${n}-court`} label={t.ecoleCourt}>
              <Input id={`ecole-${n}-court`} name={`ecole-${n}-court`} required />
            </Champ>
            {ecoles.length > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.retirerEcole(index + 1)}
                onClick={() => {
                  setEcoles((liste) => liste.filter((x) => x !== n));
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
        {type === 'groupe' ? (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              setEcoles((liste) => [...liste, Math.max(...liste) + 1]);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.ajouterEcole}
          </Button>
        ) : null}
      </fieldset>

      <div id={erreursId} role="alert" aria-live="polite" className="text-sm text-bad">
        {erreurs.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {erreurs.map((erreur) => (
              <li key={erreur}>{erreur}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="submit" disabled={envoi} className="self-start" aria-describedby={erreursId}>
        {envoi ? t.enCours : t.creer}
      </Button>
    </form>
  );
}
