'use client';

import type { PersonneDetail } from '@scolaly/contracts';
import { Button, Card } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { ChampsIdentite, lireIdentite } from '../champs-identite';

const t = fr.personnes.fiche;

/** Carte « Identité » de la fiche : consultation, puis modification avec contrôle de version. */
export function FicheIdentite({
  personne,
  modifiable,
}: {
  personne: PersonneDetail;
  modifiable: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [enregistre, setEnregistre] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const resultat = await envoyer(
      `/api/personnes/${personne.id}`,
      'PATCH',
      {
        ...lireIdentite(event.currentTarget, personne.naissanceVisible),
        version: personne.version,
      },
      fr.personnes.erreur,
    );
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      // Version dépassée : la fiche est rechargée pour comparer avec la version actuelle.
      if ((resultat.body as { actuelle?: unknown } | null)?.actuelle) router.refresh();
      return;
    }
    setErreurs(SANS_ERREUR);
    setEdition(false);
    setEnregistre(true);
    router.refresh();
  }

  const lignes: [string, string | null][] = [
    [t.champs.civilite, personne.civilite ? (t.civilites[personne.civilite] ?? null) : null],
    [t.champs.prenom, personne.prenom],
    [t.champs.nom, personne.nom],
    [t.champs.nomUsage, personne.nomUsage],
    [t.champs.email, personne.email],
    [t.champs.telephone, personne.telephone],
    [
      t.champs.adresseLigne1,
      [personne.adresseLigne1, [personne.codePostal, personne.ville].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null,
    ],
    [
      t.champs.dateNaissance,
      personne.naissanceVisible
        ? personne.dateNaissance
          ? formatDate(personne.dateNaissance)
          : null
        : t.naissanceMasquee,
    ],
    [
      t.champs.lieuNaissance,
      personne.naissanceVisible ? personne.lieuNaissance : t.naissanceMasquee,
    ],
  ];

  return (
    <Card className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.identite}</h2>
        {modifiable && !edition ? (
          <Button
            variant="secondary"
            onClick={() => {
              setEnregistre(false);
              setEdition(true);
            }}
          >
            {t.modifier}
          </Button>
        ) : null}
      </div>
      {edition ? (
        <form
          key={personne.version}
          className="flex flex-col gap-5"
          onSubmit={(event) => void onSubmit(event)}
        >
          <ChampsIdentite
            valeurs={personne}
            erreurs={erreurs}
            naissanceVisible={personne.naissanceVisible}
          />
          <MessageErreur
            erreurs={erreurs}
            champs={['nom', 'prenom', 'email', 'dateNaissance', 'lieuNaissance']}
          />
          <div className="flex gap-2">
            <Button type="submit">{t.enregistrer}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setErreurs(SANS_ERREUR);
                setEdition(false);
              }}
            >
              {t.annuler}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[200px_1fr]">
          {lignes.map(([libelle, valeur]) => (
            <div key={libelle} className="contents">
              <dt className="text-muted">{libelle}</dt>
              <dd>{valeur ?? t.nonRenseigne}</dd>
            </div>
          ))}
        </dl>
      )}
      <p role="status" className="text-sm text-ok empty:hidden">
        {enregistre ? t.enregistre : ''}
      </p>
    </Card>
  );
}
