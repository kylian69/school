'use client';

import {
  AppelEnDirect,
  ApprenantsAjoutables,
  PhotosAppel,
  type AppelEnDirect as Appel,
  type ApprenantsAjoutables as Ajoutables,
  type StatutMarque,
} from '@scolaly/contracts';
import { Button, Input } from '@scolaly/ui';
import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';
import { envoyer, type Resultat } from '@/lib/requete';

const t = fr.emargement;
/** Les adresses des photos valent 5 minutes : relues un peu avant. */
const RELECTURE_PHOTOS_MS = 4 * 60_000;

type Ligne = Appel['liste'][number];

/** Retard proposé : minutes écoulées depuis le début de la séance, au moins une. */
const minutesDepuis = (debut: number) => Math.max(1, Math.ceil((Date.now() - debut) / 60_000));

/** Message d'une erreur de l'API : le détail du champ s'il y en a un, sinon le message. */
export const messageErreur = (resultat: Extract<Resultat, { ok: false }>) =>
  resultat.details.map((d) => d.slice(d.indexOf(' : ') + 3)).join(' ') || resultat.erreur;

/** Ce que l'intervenant lit sous le nom : statut, heure du scan, origine de la décision. */
function etatDe(l: Ligne, hybride: boolean): { texte: string; ton: string } {
  // RG-06-08 : en hybride, l'heure du scan dit aussi s'il a été fait à distance.
  const heure = l.scanneLe
    ? `${formatHeure(l.scanneLe)}${hybride && l.aDistance ? ` · ${t.aDistance}` : ''}`
    : null;
  const suite = (texte: string) =>
    [texte, l.decision === 'confirme' ? t.scanConfirme : null, l.nonAttendu ? t.nonAttendu : null]
      .filter(Boolean)
      .join(' · ');
  switch (l.statut) {
    case 'present':
      return {
        texte: suite(
          [heure ?? t.etat.present, l.marquage && !heure ? t.manuel : null]
            .filter(Boolean)
            .join(' · '),
        ),
        ton: 'text-ok',
      };
    case 'retard':
      // RG-06-02 : minutes de la décision, sinon celles enregistrées au scan tardif.
      return {
        texte: suite([heure, t.etat.retard(l.minutesRetard ?? 0)].filter(Boolean).join(' · ')),
        ton: 'text-warn',
      };
    case 'absent':
      return {
        texte: suite(heure ? `${t.etat.absent} · ${t.scanRetire}` : t.etat.absent),
        ton: 'text-bad',
      };
    case 'a-verifier': {
      // RG-06-11 : scan hors site, de position inconnue ou rejoué, signalé avec sa raison.
      const raison =
        l.raison === 'hors-site' || l.raison === 'inconnu'
          ? t.localisationListe[l.raison]
          : l.raison === 'rejoue'
            ? t.rejoue
            : t.etat['a-verifier'];
      return { texte: `${heure ?? ''} · ${raison}`, ton: 'text-warn font-medium' };
    }
    case 'en-attente':
      return { texte: t.enAttente, ton: 'text-muted' };
  }
}

/**
 * Liste d'appel de l'intervenant (US-06-03 à US-06-05 ; RG-06-11, RG-06-12, RG-06-15) : photos,
 * statut de chacun, et un geste pour le marquer présent, en retard ou absent. Sur un appel validé,
 * chaque changement est une correction, avec un motif ; un appel verrouillé ne se corrige plus
 * qu'avec le droit spécifique (RG-06-15), toujours avec un motif.
 */
export function ListeAppel({
  seanceId,
  debut,
  hybride = false,
  appel,
  surAppel,
}: {
  seanceId: string;
  debut: number;
  /** Séance hybride : les émargements à distance sont signalés (RG-06-08). */
  hybride?: boolean;
  appel: Appel | null;
  surAppel: (appel: Appel) => void;
}) {
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [retardOuvert, setRetardOuvert] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('');
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajoutables, setAjoutables] = useState<Ajoutables | null>(null);
  const [ajoute, setAjoute] = useState('');

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

  const etat = appel?.etat ?? 'ouvert';
  // RG-06-15 : un appel verrouillé se corrige encore avec le droit spécifique (calculé par l'API).
  const verrouilleCorrigible = etat === 'verrouille' && (appel?.correctionVerrouillee ?? false);
  const modifiable = etat === 'ouvert' || etat === 'valide' || verrouilleCorrigible;
  const correction = etat === 'valide' || verrouilleCorrigible;

  const marquer = async (
    personneId: string,
    statut: StatutMarque,
    minutesRetard: number | null = null,
  ) => {
    setEnCours(personneId);
    setErreur(null);
    const resultat = await envoyer(
      `/api/seances/${seanceId}/appel/presences/${personneId}`,
      'PUT',
      { statut, minutesRetard, ...(correction ? { motif } : {}) },
      t.marquageEchec,
    );
    setEnCours(null);
    const lu = resultat.ok ? AppelEnDirect.safeParse(resultat.body) : null;
    if (!lu?.success) {
      setErreur(resultat.ok ? t.marquageEchec : messageErreur(resultat));
      return false;
    }
    setRetardOuvert(null);
    surAppel(lu.data);
    return true;
  };

  const ouvrirRetard = (l: Ligne) => {
    setRetardOuvert(l.personneId);
    setMinutes(String(l.minutesRetard ?? minutesDepuis(debut)));
  };

  const ouvrirAjout = async () => {
    try {
      const reponse = await fetch(`/api/seances/${seanceId}/appel/ajoutables`);
      const lu = ApprenantsAjoutables.safeParse(reponse.ok ? await reponse.json() : null);
      setAjoutables(lu.success ? lu.data : []);
    } catch {
      setErreur(t.marquageEchec);
    }
  };

  const liste = appel?.liste ?? [];
  const compte = (statut: Ligne['statut']) => liste.filter((l) => l.statut === statut).length;

  return (
    <>
      <p className="text-2xl font-semibold" aria-live="polite">
        {t.presents(appel?.presents ?? 0, appel?.attendus ?? 0)}
      </p>
      <p className="text-sm text-muted">
        {compte('present')} {t.aLHeure} · {compte('retard')} {t.enRetard} · {compte('a-verifier')}{' '}
        {t.aVerifier} · {compte('absent')} {t.absents} · {compte('en-attente')} {t.enAttente}
      </p>
      {correction ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.motifCorrection}</span>
          <Input
            value={motif}
            maxLength={500}
            aria-describedby="motif-aide"
            onChange={(evenement) => {
              setMotif(evenement.target.value);
            }}
          />
          <span id="motif-aide" className="text-xs text-muted">
            {verrouilleCorrigible ? t.motifAideVerrouille : t.motifAide}
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted">{modifiable ? t.appelManuelAide : null}</p>
      )}
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
          const etatLigne = etatDe(l, hybride);
          const photo = photos.get(l.personneId);
          const choisi: StatutMarque | null =
            l.marquage?.statut ??
            (l.statut === 'present' || l.statut === 'retard' ? l.statut : null);
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
                  <span className={etatLigne.ton}>{etatLigne.texte}</span>
                </div>
              </div>
              {modifiable ? (
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
                        else void marquer(l.personneId, statut);
                      }}
                    >
                      {t.statuts[statut]}
                    </Button>
                  ))}
                </div>
              ) : null}
              {retardOuvert === l.personneId ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(evenement) => {
                    evenement.preventDefault();
                    void marquer(l.personneId, 'retard', Number(minutes));
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
      {modifiable ? (
        // Module 06, section 7 : apprenant du mauvais groupe, ajouté avec signalement.
        <details
          className="text-sm"
          onToggle={(evenement) => {
            if (evenement.currentTarget.open) void ouvrirAjout();
          }}
        >
          <summary className="cursor-pointer font-medium">{t.ajouterTitre}</summary>
          <p className="mt-1 text-xs text-muted">{t.ajouterAide}</p>
          {ajoutables?.length === 0 ? (
            <p className="mt-2 text-muted">{t.aucunAjoutable}</p>
          ) : ajoutables ? (
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(evenement) => {
                evenement.preventDefault();
                void marquer(ajoute, 'present').then((ok) => {
                  if (ok) {
                    setAjoute('');
                    setAjoutables(ajoutables.filter((a) => a.personneId !== ajoute));
                  }
                });
              }}
            >
              <label className="flex flex-col gap-1">
                <span>{t.ajouterChoix}</span>
                <select
                  required
                  value={ajoute}
                  onChange={(evenement) => {
                    setAjoute(evenement.target.value);
                  }}
                  className="h-11 rounded-control border border-line bg-surface px-3"
                >
                  <option value="">{t.ajouterChoisir}</option>
                  {ajoutables.map((a) => (
                    <option key={a.personneId} value={a.personneId}>
                      {`${a.prenom} ${a.nom}`}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary" disabled={enCours === ajoute}>
                {t.ajouter}
              </Button>
            </form>
          ) : null}
        </details>
      ) : null}
      <p className="text-xs text-muted">{t.direct}</p>
    </>
  );
}
