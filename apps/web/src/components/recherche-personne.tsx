'use client';

import type { PersonneResume } from '@scolaly/contracts';
import { Button, Input, Label } from '@scolaly/ui';
import { useId, useState } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.scolarite.apprenants;

/** Recherche d'une personne de l'école (nom ou email), dans le périmètre de la personne connectée. */
export function RecherchePersonne({
  choisie,
  onChoisir,
}: {
  choisie: PersonneResume | null;
  onChoisir: (personne: PersonneResume) => void;
}) {
  const id = useId();
  const [resultats, setResultats] = useState<PersonneResume[] | null>(null);

  async function chercher(q: string) {
    if (q.trim().length < 2) {
      setResultats(null);
      return;
    }
    const reponse = await fetch(
      `/api/personnes?${new URLSearchParams({ q, parPage: '10' }).toString()}`,
    );
    const corps = (await reponse.json().catch(() => null)) as {
      personnes?: PersonneResume[];
    } | null;
    setResultats(corps?.personnes ?? []);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t.rechercher}</Label>
      <Input
        id={id}
        type="search"
        autoComplete="off"
        onChange={(e) => void chercher(e.target.value)}
      />
      {resultats ? (
        resultats.length === 0 ? (
          <p className="text-sm text-muted">{t.aucunResultat}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {resultats.map((p) => {
              const nom = `${p.prenom} ${p.nomUsage ?? p.nom}`;
              return (
                <li key={p.id}>
                  <Button
                    variant={choisie?.id === p.id ? 'secondary' : 'ghost'}
                    aria-pressed={choisie?.id === p.id}
                    aria-label={t.choisir(nom)}
                    className="w-full justify-start"
                    onClick={() => {
                      onChoisir(p);
                    }}
                  >
                    {`${nom} · ${p.email}`}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
