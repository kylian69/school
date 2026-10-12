'use client';

import {
  AppelEnDirect,
  PhotosAppel,
  type AppelEnDirect as Appel,
  type StatutMarque,
} from '@scolaly/contracts';
import { Button, Input } from '@scolaly/ui';
import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.emargement;
/** Tolérance avant retard (RG-06-02), pour l'affichage seulement : le serveur fait foi. */
const TOLERANCE_MS = 5 * 60_000;
/** Les adresses des photos valent 5 minutes : relues un peu avant. */
const RELECTURE_PHOTOS_MS = 4 * 60_000;

type Ligne = Appel['liste'][number];

/** Retard d'un scan au-delà de la tolérance, sans décision de l'intervenant. */
const scanEnRetard = (l: Ligne, debut: number) =>
  l.statut === 'present' &&
  !l.marquage &&
  l.scanneLe !== null &&
  Date.parse(l.scanneLe) > debut + TOLERANCE_MS;

/** Retard proposé : minutes écoulées depuis le début de la séance, au moins une. */
const minutesDepuis = (debut: number) => Math.max(1, Math.ceil((Date.now() - debut) / 60_000));

/** Ce que l'intervenant lit sous le nom : statut, heure du scan, origine de la décision. */
function etatDe(l: Ligne): { texte: string; ton: string } {
  const heure = l.scanneLe ? formatHeure(l.scanneLe) : null;
  switch (l.statut) {
    case 'present':
      return {
        texte: [heure ?? t.etat.present, l.marquage && !heure ? t.manuel : null]
          .filter(Boolean)
          .join(' · '),
        ton: 'text-ok',
      };
    case 'retard':
      return { texte: t.etat.retard(l.marquage?.minutesRetard ?? 0), ton: 'text-warn' };
    case 'absent':
      return {
        texte: heure ? `${t.etat.absent} · ${t.scanRetire}` : t.etat.absent,
        ton: 'text-bad',
      };
    case 'a-verifier': {
      // RG-06-11 : scan hors site, de position inconnue ou rejoué, signalé avec sa raison.
      const raison =
        l.localisation === 'hors-site' || l.localisation === 'inconnu'
          ? t.localisationListe[l.localisation]
          : t.rejoue;
      return { texte: `${heure ?? ''} · ${raison}`, ton: 'text-warn font-medium' };
    }
    case 'en-attente':
      return { texte: t.enAttente, ton: 'text-muted' };
  }
}

/**
 * Liste d'appel de l'intervenant (US-06-03 à US-06-05 ; RG-06-11, RG-06-12) : photos, statut de
 * chacun, et un geste pour le marquer présent, en retard ou absent. La liste est celle du flux en
 * direct ; la réponse de chaque marquage la remet aussitôt à jour.
 */
export function ListeAppel({
  seanceId,
  debut,
  appel,
  surAppel,
}: {
  seanceId: string;
  debut: number;
  appel: Appel | null;
  surAppel: (appel: Appel) => void;
}) {
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [retardOuvert, setRetardOuvert] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Photos (RG-01-27) : adresses signées de courte durée, relues avant leur expiration.
  useEffect(() => {
    let annule = false;
    const lire = async () => {
      try {
        const reponse = await fetch(`/api/seances/${seanceId}/appel/photos`);
        const lu = PhotosAppel.safeParse(reponse.ok ? await reponse.json() : null);
        if (lu.success && !annule)
          setPhotos(new Map(lu.data.photos.map((p) => [p.personneId, p.url])));
      } catch {
        // Sans réseau : les initiales restent affichées.
      }
    };
    void lire();
    const minuterie = setInterval(() => void lire(), RELECTURE_PHOTOS_MS);
    return () => {
      annule = true;
      clearInterval(minuterie);
    };
  }, [seanceId]);

  const marquer = async (l: Ligne, statut: StatutMarque, minutesRetard: number | null = null) => {
    setEnCours(l.personneId);
    setErreur(null);
    const resultat = await envoyer(
      `/api/seances/${seanceId}/appel/presences/${l.personneId}`,
      'PUT',
      { statut, minutesRetard },
      t.marquageEchec,
    );
    setEnCours(null);
    const lu = resultat.ok ? AppelEnDirect.safeParse(resultat.body) : null;
    if (!lu?.success) {
      setErreur(resultat.ok ? t.marquageEchec : resultat.erreur);
      return;
    }
    setRetardOuvert(null);
    surAppel(lu.data);
  };

  const ouvrirRetard = (l: Ligne) => {
    setRetardOuvert(l.personneId);
    setMinutes(String(l.marquage?.minutesRetard ?? minutesDepuis(debut)));
  };

  const liste = appel?.liste ?? [];
  const compte = (filtre: (l: Ligne) => boolean) => liste.filter(filtre).length;
  const enRetard = compte((l) => l.statut === 'retard' || scanEnRetard(l, debut));

  return (
    <>
      <p className="text-2xl font-semibold" aria-live="polite">
        {t.presents(appel?.presents ?? 0, appel?.attendus ?? 0)}
      </p>
      <p className="text-sm text-muted">
        {compte((l) => l.statut === 'present' && !scanEnRetard(l, debut))} {t.aLHeure} · {enRetard}{' '}
        {t.enRetard} · {compte((l) => l.statut === 'a-verifier')} {t.aVerifier} ·{' '}
        {compte((l) => l.statut === 'absent')} {t.absents} ·{' '}
        {compte((l) => l.statut === 'en-attente')} {t.enAttente}
      </p>
      <p className="text-xs text-muted">{t.appelManuelAide}</p>
      {erreur ? (
        <p role="alert" className="text-sm text-bad">
          {erreur}
        </p>
      ) : null}
      <ul
        className="flex max-h-[70vh] flex-col divide-y divide-line overflow-y-auto"
        tabIndex={0}
        aria-label={t.direct}
      >
        {liste.map((l) => {
          const nom = `${l.prenom} ${l.nom}`;
          const etat = etatDe(l);
          const photo = photos.get(l.personneId);
          const choisi: StatutMarque | null =
            l.marquage?.statut ?? (l.statut === 'present' ? 'present' : null);
          return (
            <li key={l.personneId} className="flex flex-col gap-2 py-2 text-sm">
              <div className="flex items-center gap-3">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- adresse signée de courte durée, jamais optimisée ni mise en cache partagé
                  <img
                    src={photo}
                    alt={t.photo(nom)}
                    width={48}
                    height={48}
                    className="size-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-muted"
                  >
                    {(l.prenom[0] ?? '') + (l.nom[0] ?? '')}
                  </span>
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{nom}</span>
                  <span className={etat.ton}>{etat.texte}</span>
                </div>
              </div>
              <div role="group" aria-label={t.marquer(nom)} className="flex flex-wrap gap-2">
                {(['present', 'retard', 'absent'] as const).map((statut) => (
                  <Button
                    key={statut}
                    type="button"
                    variant={choisi === statut ? 'primary' : 'secondary'}
                    aria-pressed={choisi === statut}
                    disabled={enCours === l.personneId}
                    className="flex-1"
                    onClick={() => {
                      if (statut === 'retard') ouvrirRetard(l);
                      else void marquer(l, statut);
                    }}
                  >
                    {t.statuts[statut]}
                  </Button>
                ))}
              </div>
              {retardOuvert === l.personneId ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(evenement) => {
                    evenement.preventDefault();
                    void marquer(l, 'retard', Number(minutes));
                  }}
                >
                  <label className="flex flex-col gap-1">
                    <span>{t.minutesRetard}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      required
                      value={minutes}
                      onChange={(evenement) => {
                        setMinutes(evenement.target.value);
                      }}
                      className="w-24"
                    />
                  </label>
                  <Button type="submit" disabled={enCours === l.personneId}>
                    {t.enregistrerRetard}
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">{t.direct}</p>
    </>
  );
}
