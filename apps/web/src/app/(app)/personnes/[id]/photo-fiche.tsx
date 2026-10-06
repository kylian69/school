'use client';

import type { PersonneDetail } from '@scolaly/contracts';
import { Button, Card, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { DepotPhoto } from '@/components/photo/depot-photo';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.photo;

/** Photo de la fiche : dépôt par la scolarité, validation d'une photo déposée (RG-01-26). */
export function PhotoFiche({ personne, nom }: { personne: PersonneDetail; nom: string }) {
  const router = useRouter();
  const motifId = useId();
  const [refus, setRefus] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const photo = personne.photo;

  async function decider(decision: 'valider' | 'refuser', motif?: string) {
    const resultat = await envoyer(
      `/api/personnes/${personne.id}/photo/decision`,
      'POST',
      { decision, ...(motif ? { motif } : {}) },
      t.erreur,
    );
    if (!resultat.ok) {
      setErreur(
        resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur,
      );
      return;
    }
    setErreur(null);
    setRefus(false);
    router.refresh();
  }

  return (
    <Card className="flex max-w-3xl flex-col gap-4">
      <h2 className="text-lg font-semibold">{t.titre}</h2>
      <div className="flex flex-wrap items-start gap-4">
        {photo?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={t.portrait(nom)}
            width={128}
            height={128}
            className="size-32 rounded-card border border-line object-cover"
          />
        ) : (
          <p className="text-sm text-muted">{t.aucune}</p>
        )}
        <DepotPhoto
          url={`/api/personnes/${personne.id}/photo`}
          libelle={photo?.url ? t.remplacer : t.deposer}
          succes={t.enregistree}
        />
      </div>
      {photo?.attenteUrl ? (
        <section
          aria-labelledby="titre-photo-attente"
          className="flex flex-col gap-3 border-t border-line pt-4"
        >
          <h3 id="titre-photo-attente" className="text-sm font-semibold">
            {t.attente}
          </h3>
          <p className="text-xs text-muted">{t.attenteDescription}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.attenteUrl}
            alt={`${t.attente} : ${nom}`}
            width={128}
            height={128}
            className="size-32 rounded-card border border-line object-cover"
          />
          {refus ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const motif = new FormData(event.currentTarget).get('motif');
                void decider('refuser', typeof motif === 'string' ? motif : '');
              }}
            >
              <Label htmlFor={motifId}>{t.motif}</Label>
              <Input id={motifId} name="motif" required maxLength={300} />
              <Button type="submit" variant="danger" className="self-start">
                {t.confirmerRefus}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void decider('valider')}>{t.valider}</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRefus(true);
                }}
              >
                {t.refuser}
              </Button>
            </div>
          )}
          <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
            {erreur}
          </p>
        </section>
      ) : null}
    </Card>
  );
}
