'use client';

import { CIVILITES, type PersonneDetail } from '@scolaly/contracts';
import { Label } from '@scolaly/ui';
import { useId } from 'react';
import { Champ, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';

const t = fr.personnes.fiche;

/** Champs d'identité d'une fiche (création et modification, E-01-05). */
export function ChampsIdentite({
  valeurs,
  erreurs,
  naissanceVisible,
}: {
  valeurs: Partial<PersonneDetail> | null;
  erreurs: Erreurs;
  /** Date et lieu de naissance : scolarité et administration seulement. */
  naissanceVisible: boolean;
}) {
  const civiliteId = useId();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={civiliteId}>{t.champs.civilite}</Label>
        <select
          id={civiliteId}
          name="civilite"
          defaultValue={valeurs?.civilite ?? ''}
          className="h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm"
        >
          {['', ...CIVILITES].map((c) => (
            <option key={c} value={c}>
              {t.civilites[c]}
            </option>
          ))}
        </select>
      </div>
      <Champ
        nom="prenom"
        label={t.champs.prenom}
        erreurs={erreurs}
        defaultValue={valeurs?.prenom ?? ''}
        required
        maxLength={100}
        autoComplete="off"
      />
      <Champ
        nom="nom"
        label={t.champs.nom}
        erreurs={erreurs}
        defaultValue={valeurs?.nom ?? ''}
        required
        maxLength={100}
        autoComplete="off"
      />
      <Champ
        nom="nomUsage"
        label={t.champs.nomUsage}
        erreurs={erreurs}
        defaultValue={valeurs?.nomUsage ?? ''}
        maxLength={100}
        autoComplete="off"
      />
      <Champ
        nom="email"
        label={t.champs.email}
        erreurs={erreurs}
        defaultValue={valeurs?.email ?? ''}
        type="email"
        required
        autoComplete="off"
      />
      <Champ
        nom="telephone"
        label={t.champs.telephone}
        erreurs={erreurs}
        defaultValue={valeurs?.telephone ?? ''}
        type="tel"
        maxLength={30}
        autoComplete="off"
      />
      {naissanceVisible ? (
        <>
          <Champ
            nom="dateNaissance"
            label={t.champs.dateNaissance}
            erreurs={erreurs}
            defaultValue={valeurs?.dateNaissance ?? ''}
            type="date"
          />
          <Champ
            nom="lieuNaissance"
            label={t.champs.lieuNaissance}
            erreurs={erreurs}
            defaultValue={valeurs?.lieuNaissance ?? ''}
            maxLength={120}
          />
        </>
      ) : null}
      <Champ
        nom="ine"
        label={t.champs.ine}
        erreurs={erreurs}
        defaultValue={valeurs?.ine ?? ''}
        maxLength={20}
        autoComplete="off"
      />
      <Champ
        nom="adresseLigne1"
        label={t.champs.adresseLigne1}
        erreurs={erreurs}
        defaultValue={valeurs?.adresseLigne1 ?? ''}
        maxLength={200}
        autoComplete="off"
      />
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Champ
          nom="codePostal"
          label={t.champs.codePostal}
          erreurs={erreurs}
          defaultValue={valeurs?.codePostal ?? ''}
          maxLength={10}
          autoComplete="off"
        />
        <Champ
          nom="ville"
          label={t.champs.ville}
          erreurs={erreurs}
          defaultValue={valeurs?.ville ?? ''}
          maxLength={120}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

/** Valeurs du formulaire d'identité, au format de l'API (vide : null). */
export function lireIdentite(form: HTMLFormElement, naissanceVisible: boolean) {
  const data = new FormData(form);
  const valeur = (cle: string) => {
    const v = data.get(cle);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  return {
    civilite: valeur('civilite'),
    nom: valeur('nom') ?? '',
    nomUsage: valeur('nomUsage'),
    prenom: valeur('prenom') ?? '',
    email: valeur('email') ?? '',
    telephone: valeur('telephone'),
    adresseLigne1: valeur('adresseLigne1'),
    codePostal: valeur('codePostal'),
    ville: valeur('ville'),
    ine: valeur('ine'),
    ...(naissanceVisible
      ? { dateNaissance: valeur('dateNaissance'), lieuNaissance: valeur('lieuNaissance') }
      : {}),
  };
}
