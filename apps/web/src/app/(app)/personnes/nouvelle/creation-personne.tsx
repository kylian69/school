'use client';

import type { DoublonPersonne } from '@scolaly/contracts';
import { Button } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type SyntheticEvent } from 'react';
import { MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';
import { ChampsIdentite, lireIdentite } from '../champs-identite';

const t = fr.personnes;

export function CreationPersonne() {
  const router = useRouter();
  const formulaire = useRef<HTMLFormElement>(null);
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [doublons, setDoublons] = useState<DoublonPersonne[]>([]);

  async function creer(ignorerDoublons: boolean) {
    if (!formulaire.current) return;
    const resultat = await envoyer(
      '/api/personnes',
      'POST',
      { ...lireIdentite(formulaire.current, true), ignorerDoublons },
      t.erreur,
    );
    if (resultat.ok) {
      router.push(`/personnes/${(resultat.body as { id: string }).id}`);
      return;
    }
    setErreurs({ message: resultat.erreur, details: resultat.details });
    const trouves = (resultat.body as { doublons?: DoublonPersonne[] } | null)?.doublons;
    setDoublons(Array.isArray(trouves) ? trouves : []);
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    void creer(false);
  }

  const emailPris = doublons.some((d) => d.motifs.includes('email'));
  return (
    <form ref={formulaire} className="flex flex-col gap-5" onSubmit={onSubmit}>
      <ChampsIdentite valeurs={null} erreurs={erreurs} naissanceVisible />
      <MessageErreur
        erreurs={erreurs}
        champs={['nom', 'prenom', 'email', 'dateNaissance', 'lieuNaissance']}
      />
      {doublons.length > 0 ? (
        <section aria-labelledby="titre-doublons" className="flex flex-col gap-2">
          <h2 id="titre-doublons" className="text-sm font-semibold">
            {t.creation.doublons}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {doublons.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/personnes/${d.id}`}
                  className="font-semibold hover:underline"
                  aria-label={t.creation.ouvrir(`${d.prenom} ${d.nom}`)}
                >
                  {d.prenom} {d.nom}
                </Link>{' '}
                <span className="text-muted">
                  · {d.email} · {d.motifs.map((m) => t.creation.motifs[m]).join(', ')}
                </span>
              </li>
            ))}
          </ul>
          {emailPris ? null : (
            <Button variant="secondary" className="self-start" onClick={() => void creer(true)}>
              {t.creation.creerQuandMeme}
            </Button>
          )}
        </section>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit">{t.creation.creer}</Button>
        <Button variant="ghost" asChild>
          <Link href="/personnes">{t.fiche.annuler}</Link>
        </Button>
      </div>
    </form>
  );
}
