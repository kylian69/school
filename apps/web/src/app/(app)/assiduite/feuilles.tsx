'use client';

import { Button, Input, Label } from '@scolaly/ui';
import { useState, type SyntheticEvent } from 'react';
import { telechargerPdf } from '@/components/telecharger-pdf';
import { fr } from '@/i18n/fr';
import { SELECT } from '../formations/envoi';

const t = fr.feuilles;

/** Mois courant AAAA-MM (heure du navigateur). */
const moisCourant = () => new Date().toISOString().slice(0, 7);

function useTelechargement() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const lancer = (url: string) => {
    setEnCours(true);
    void telechargerPdf(url).then((message) => {
      setErreur(message);
      setEnCours(false);
    });
  };
  return { enCours, erreur, lancer };
}

const Erreur = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="w-full text-sm text-bad">
      {message}
    </p>
  ) : null;

/**
 * E-06-09, US-06-11 : feuilles d'une promotion pour un mois, par séance (feuilles signées) ou par
 * apprenant (récapitulatifs mensuels, RG-06-26), en un PDF.
 */
export function FeuillesPromotion({
  promotions,
}: {
  promotions: readonly { id: string; libelle: string }[];
}) {
  const { enCours, erreur, lancer } = useTelechargement();
  const soumettre = (evenement: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    const champ = (nom: string) => {
      const valeur = donnees.get(nom);
      return typeof valeur === 'string' ? valeur : '';
    };
    const params = new URLSearchParams({
      promotionId: champ('promotionId'),
      mois: champ('mois'),
      format: champ('format'),
    });
    lancer(`/api/assiduite/feuilles?${params.toString()}`);
  };
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={soumettre}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feuilles-promotion">{t.promotion}</Label>
        <select id="feuilles-promotion" name="promotionId" required className={SELECT}>
          {promotions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.libelle}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feuilles-mois">{t.mois}</Label>
        <Input id="feuilles-mois" name="mois" type="month" required defaultValue={moisCourant()} />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{t.format}</legend>
        <div className="flex gap-3 text-sm">
          {(['seances', 'apprenants'] as const).map((format) => (
            <label key={format} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="format"
                value={format}
                defaultChecked={format === 'seances'}
              />
              {t.formats[format]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="secondary" disabled={enCours}>
        {enCours ? t.enCours : t.telecharger}
      </Button>
      <Erreur message={erreur} />
    </form>
  );
}

/** E-06-04 : son récapitulatif mensuel PDF (RG-06-26). */
export function MonRecapitulatif() {
  const { enCours, erreur, lancer } = useTelechargement();
  const [mois, setMois] = useState(moisCourant);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        lancer(`/api/moi/recapitulatif?mois=${encodeURIComponent(mois)}`);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recapitulatif-mois">{t.mois}</Label>
        <Input
          id="recapitulatif-mois"
          type="month"
          required
          value={mois}
          onChange={(e) => {
            setMois(e.target.value);
          }}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={enCours}>
        {enCours ? t.enCours : t.recapitulatif}
      </Button>
      <Erreur message={erreur} />
    </form>
  );
}
