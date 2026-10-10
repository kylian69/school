'use client';

import {
  lireJeton,
  ResultatScan,
  type PositionScan,
  type ResultatScan as Resultat,
  type SeanceProche,
} from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import jsQR from 'jsqr';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';

const t = fr.emargement;
/** Scans conservés sans réseau, renvoyés au retour de la connexion (RG-00-19). */
const FILE_HORS_LIGNE = 'scolaly:emargements-en-attente';

/** Attente maximale de la position : au-delà, le scan part sans elle (RGPD-03, jamais bloqué). */
const DELAI_POSITION_MS = 8000;
/** Arrondi à 4 décimales (environ 11 m) : pas plus précis que nécessaire pour un rayon de site. */
const arrondir = (degres: number) => Math.round(degres * 1e4) / 1e4;
/** Écart maximal dû à l'arrondi, ajouté à la précision annoncée pour rester honnête. */
const ECART_ARRONDI_METRES = 8;

/**
 * RGPD-03 : position du téléphone, demandée seulement pour une séance qui la contrôle. Le
 * navigateur demande l'autorisation ; un refus, une absence ou un délai dépassé donnent « rien »,
 * et le scan part quand même. La position n'est jamais gardée sur l'appareil.
 */
function lirePosition(): Promise<PositionScan | undefined> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(undefined);
  }
  return new Promise((resoudre) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        resoudre({
          latitude: arrondir(p.coords.latitude),
          longitude: arrondir(p.coords.longitude),
          precisionMetres: Math.ceil(p.coords.accuracy) + ECART_ARRONDI_METRES,
        });
      },
      () => {
        resoudre(undefined);
      },
      { enableHighAccuracy: true, timeout: DELAI_POSITION_MS, maximumAge: 60_000 },
    );
  });
}

type Envoi =
  { etat: 'ok'; resultat: Resultat } | { etat: 'erreur'; message: string } | { etat: 'hors-ligne' };

function fileHorsLigne(): string[] {
  try {
    const valeur: unknown = JSON.parse(localStorage.getItem(FILE_HORS_LIGNE) ?? '[]');
    return Array.isArray(valeur) ? valeur.filter((j): j is string => typeof j === 'string') : [];
  } catch {
    return [];
  }
}

function ecrireFile(jetons: readonly string[]) {
  try {
    localStorage.setItem(FILE_HORS_LIGNE, JSON.stringify(jetons));
  } catch {
    // Stockage indisponible (navigation privée) : le scan n'est pas conservé.
  }
}

/** Envoie un scan ; sans réseau, le garde pour plus tard. */
async function envoyerScan(url: string, corps: unknown, jeton?: string): Promise<Envoi> {
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    if (jeton) ecrireFile([...new Set([...fileHorsLigne(), jeton])]);
    return { etat: 'hors-ligne' };
  }
  const corpsReponse: unknown = await reponse.json().catch(() => null);
  const lu = ResultatScan.safeParse(corpsReponse);
  if (reponse.ok && lu.success) return { etat: 'ok', resultat: lu.data };
  const message = (corpsReponse as { message?: unknown } | null)?.message;
  return { etat: 'erreur', message: typeof message === 'string' ? message : t.erreur };
}

export function EcranEmarger({ seances }: { seances: readonly SeanceProche[] }) {
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [camera, setCamera] = useState<'fermee' | 'ouverte' | 'indisponible'>('fermee');
  const video = useRef<HTMLVideoElement>(null);
  const idCode = useId();
  const idInfo = useId();
  const [seanceCode, setSeanceCode] = useState(seances[0]?.id ?? '');
  const [lecturePosition, setLecturePosition] = useState(false);
  /** Lecture lancée à l'ouverture de la caméra, pour être prête quand le QR est lu. */
  const position = useRef<Promise<PositionScan | undefined> | null>(null);
  const controlees = useMemo(
    () => new Set(seances.filter((s) => s.localisation).map((s) => s.id)),
    [seances],
  );
  const controle = controlees.size > 0;

  /** Position à joindre au scan de cette séance, si elle la contrôle. */
  const positionPour = useCallback(
    async (seanceId: string | undefined) => {
      if (!seanceId || !controlees.has(seanceId)) return undefined;
      position.current ??= lirePosition();
      setLecturePosition(true);
      try {
        return await position.current;
      } finally {
        position.current = null;
        setLecturePosition(false);
      }
    },
    [controlees],
  );

  // Renvoi des scans gardés hors ligne, au chargement et au retour du réseau.
  useEffect(() => {
    const renvoyer = async () => {
      for (const jeton of fileHorsLigne()) {
        const resultat = await envoyerScan('/api/emargement/scan', { jeton, horsLigne: true });
        if (resultat.etat === 'hors-ligne') return;
        ecrireFile(fileHorsLigne().filter((j) => j !== jeton));
        setEnvoi(resultat);
      }
    };
    const auRetour = () => {
      void renvoyer();
    };
    const premier = setTimeout(auRetour, 0);
    window.addEventListener('online', auRetour);
    return () => {
      clearTimeout(premier);
      window.removeEventListener('online', auRetour);
    };
  }, []);

  const scanner = useCallback(
    async (jeton: string) => {
      setCamera('fermee');
      const lue = await positionPour(lireJeton(jeton)?.seanceId);
      // Hors ligne, seul le jeton est gardé : la position n'est jamais stockée sur l'appareil.
      setEnvoi(await envoyerScan('/api/emargement/scan', { jeton, position: lue }, jeton));
    },
    [positionPour],
  );

  // Lecture du QR à la caméra : une image toutes les 200 ms, décodée par jsQR.
  useEffect(() => {
    if (camera !== 'ouverte') return;
    let flux: MediaStream | null = null;
    let minuterie: ReturnType<typeof setInterval> | undefined;
    const toile = document.createElement('canvas');
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((f) => {
        flux = f;
        if (!video.current) return;
        video.current.srcObject = f;
        void video.current.play();
        minuterie = setInterval(() => {
          const v = video.current;
          if (!v || v.videoWidth === 0) return;
          toile.width = v.videoWidth;
          toile.height = v.videoHeight;
          const contexte = toile.getContext('2d', { willReadFrequently: true });
          if (!contexte) return;
          contexte.drawImage(v, 0, 0);
          const image = contexte.getImageData(0, 0, toile.width, toile.height);
          const lu = jsQR(image.data, image.width, image.height);
          if (lu && lireJeton(lu.data)) void scanner(lu.data);
        }, 200);
      })
      .catch(() => {
        setCamera('indisponible');
      });
    return () => {
      clearInterval(minuterie);
      flux?.getTracks().forEach((piste) => {
        piste.stop();
      });
    };
  }, [camera, scanner]);

  async function validerCode(formulaire: FormData) {
    const valeur = formulaire.get('code');
    const code = typeof valeur === 'string' ? valeur.trim() : '';
    const lue = await positionPour(seanceCode);
    setEnvoi(
      await envoyerScan('/api/emargement/code', { seanceId: seanceCode, code, position: lue }),
    );
  }

  if (envoi?.etat === 'ok') {
    const r = envoi.resultat;
    return (
      <Card className="flex flex-col items-center gap-2 text-center" role="status">
        <p className="text-2xl font-semibold text-ok">
          {r.statut === 'deja-emarge' ? t.dejaEmarge : t.enregistree}
        </p>
        <p className="text-base">{r.seance}</p>
        <p className="text-sm text-muted">
          {t.aHeure(formatHeure(r.scanneLe))}
          {r.retardMinutes > 0 ? ` · ${t.retard(r.retardMinutes)}` : ''}
        </p>
        {r.localisation === 'hors-site' || r.localisation === 'inconnu' ? (
          <p className="rounded-control bg-warn-soft p-3 text-sm">
            {t.localisationAVerifier[r.localisation]}
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {controle ? (
        // RGPD-03 : l'apprenant est informé avant que son téléphone ne demande l'autorisation.
        <Card className="flex flex-col gap-2" role="region" aria-labelledby={idInfo}>
          <h2 id={idInfo} className="text-base font-semibold">
            {t.localisationTitre}
          </h2>
          <p className="text-sm">{t.localisationInfo}</p>
          <p className="text-sm text-muted">{t.localisationConservation}</p>
          <p className="text-sm text-muted">{t.localisationRefus}</p>
        </Card>
      ) : null}
      {lecturePosition ? (
        <p role="status" className="text-sm text-muted">
          {t.localisationEnCours}
        </p>
      ) : null}
      {envoi?.etat === 'hors-ligne' ? (
        <p role="status" className="rounded-control bg-warn-soft p-3 text-sm">
          {t.envoiEnCours}
        </p>
      ) : null}
      {envoi?.etat === 'erreur' ? (
        <p role="alert" className="rounded-control bg-bad-soft p-3 text-sm">
          {envoi.message}
        </p>
      ) : null}
      {seances.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.aucuneAEmarger}</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            {seances.map((s) => (
              <div key={s.id}>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  {s.libelle}
                  {s.modifiee ? (
                    <Badge tone="warn" title={t.modifieeAide}>
                      {t.modifiee}
                    </Badge>
                  ) : null}
                </h2>
                <p className="text-sm text-muted">
                  {t.horaire(formatHeure(s.debut), formatHeure(s.fin))}
                  {s.intervenant ? ` · ${s.intervenant}` : ''}
                </p>
              </div>
            ))}
            {camera === 'ouverte' ? (
              <div className="flex flex-col gap-2">
                <video
                  ref={video}
                  muted
                  playsInline
                  className="aspect-square w-full rounded-control bg-black object-cover"
                />
                <p className="text-sm text-muted">{t.viser}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCamera('fermee');
                  }}
                >
                  {t.annuler}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => {
                  // La position se lit pendant que l'apprenant vise le QR.
                  if (controle) position.current ??= lirePosition();
                  setCamera('ouverte');
                }}
              >
                {t.scanner}
              </Button>
            )}
            {camera === 'indisponible' ? <p className="text-sm text-bad">{t.camera}</p> : null}
            <p className="text-xs text-muted">{t.horsLigneAide}</p>
          </Card>
          <Card>
            <form action={validerCode} className="flex flex-wrap items-end gap-3">
              {seances.length > 1 ? (
                <select
                  aria-label={t.seances}
                  value={seanceCode}
                  onChange={(e) => {
                    setSeanceCode(e.target.value);
                  }}
                  className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm"
                >
                  {seances.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idCode} className="text-sm font-medium">
                  {t.code}
                </label>
                <input
                  id={idCode}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="min-h-11 w-40 rounded-control border border-line bg-surface px-3 font-mono text-lg tracking-[0.3em]"
                />
              </div>
              <Button type="submit" variant="secondary">
                {t.valider}
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
