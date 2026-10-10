'use client';

import {
  AppelEnDirect,
  genererJeton,
  OuvertureAppel,
  type AppelEnDirect as Appel,
  type OuvertureAppel as Ouverture,
} from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.emargement;
/** Tolérance avant retard (RG-06-02), pour l'affichage seulement : le serveur fait foi. */
const TOLERANCE_MS = 5 * 60_000;

/**
 * Écran de l'intervenant. Le QR et le code sont calculés ici, sans appel au serveur (RG-00-16),
 * avec l'horloge corrigée par l'heure du serveur ; la liste se rafraîchit toutes les 2 secondes.
 */
export function EcranAppel({ seanceId }: { seanceId: string }) {
  const [ouverture, setOuverture] = useState<{ donnees: Ouverture; decalage: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; code: string; changeA: number } | null>(null);
  const [reste, setReste] = useState(15);
  const [appel, setAppel] = useState<Appel | null>(null);

  useEffect(() => {
    void envoyer(
      `/api/seances/${seanceId}/appel/ouverture`,
      'POST',
      undefined,
      t.ouvertureEchec,
    ).then((resultat) => {
      const lu = resultat.ok ? OuvertureAppel.safeParse(resultat.body) : null;
      if (!lu?.success) {
        setErreur(resultat.ok ? t.ouvertureEchec : resultat.erreur);
        return;
      }
      setOuverture({ donnees: lu.data, decalage: Date.parse(lu.data.maintenant) - Date.now() });
    });
  }, [seanceId]);

  // QR et code de la fenêtre en cours, recalculés à chaque changement de fenêtre.
  useEffect(() => {
    if (!ouverture) return;
    const cle = Uint8Array.from(
      atob(ouverture.donnees.cle.replaceAll('-', '+').replaceAll('_', '/')),
      (c) => c.charCodeAt(0),
    );
    let annule = false;
    let changeA = 0;
    const tic = async () => {
      const maintenant = Date.now() + ouverture.decalage;
      if (maintenant >= changeA) {
        const jeton = await genererJeton(cle, ouverture.donnees.seanceId, maintenant);
        changeA = jeton.changeA;
        const svg = await QRCode.toString(jeton.jeton, { type: 'svg', margin: 1 });
        if (!annule) setQr({ svg, code: jeton.code, changeA });
      }
      if (!annule) setReste(Math.max(0, Math.ceil((changeA - maintenant) / 1000)));
    };
    void tic();
    const minuterie = setInterval(() => void tic(), 250);
    return () => {
      annule = true;
      clearInterval(minuterie);
    };
  }, [ouverture]);

  // Appel en direct (US-06-03) : flux SSE, reconnecté par le navigateur s'il est coupé.
  useEffect(() => {
    if (!ouverture) return;
    const flux = new EventSource(`/api/seances/${seanceId}/appel/direct`);
    flux.onmessage = (evenement: MessageEvent<string>) => {
      try {
        const lu = AppelEnDirect.safeParse(JSON.parse(evenement.data));
        if (lu.success) setAppel(lu.data);
      } catch {
        // Événement illisible : le suivant remettra la liste à jour.
      }
    };
    return () => {
      flux.close();
    };
  }, [ouverture, seanceId]);

  if (erreur) {
    return (
      <Card>
        <p role="alert" className="text-sm text-bad">
          {erreur}
        </p>
      </Card>
    );
  }
  if (!ouverture) return <p className="text-sm text-muted">{t.appelEnCours}…</p>;

  const debut = Date.parse(ouverture.donnees.debut);
  const presents = appel?.liste.filter((l) => l.scanneLe !== null) ?? [];
  const enRetard = presents.filter((l) => Date.parse(l.scanneLe ?? '') > debut + TOLERANCE_MS);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-accent">{t.appelEnCours}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {ouverture.donnees.libelle}
        </h1>
        <p className="text-sm text-muted">
          {t.horaire(formatHeure(ouverture.donnees.debut), formatHeure(ouverture.donnees.fin))}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-lg font-semibold">{t.scannez}</h2>
          <p className="text-sm text-muted">{t.scannezAide}</p>
          {qr ? (
            <div
              role="img"
              aria-label={t.qr(ouverture.donnees.libelle)}
              className="w-full max-w-sm rounded-control bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qr.svg }}
            />
          ) : null}
          <p className="text-sm text-muted" aria-live="off">
            {t.nouveauCode(reste)}
          </p>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium">{t.codeSecours}</p>
            <p className="font-mono text-3xl font-semibold tracking-[0.3em]" data-testid="code">
              {qr?.code ?? '······'}
            </p>
            <p className="max-w-sm text-xs text-muted">{t.codeAide}</p>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="text-2xl font-semibold" aria-live="polite">
            {t.presents(presents.length, appel?.attendus ?? 0)}
          </p>
          <p className="text-sm text-muted">
            {presents.length - enRetard.length} {t.aLHeure} · {enRetard.length} {t.enRetard} ·{' '}
            {(appel?.attendus ?? 0) - presents.length} {t.enAttente}
          </p>
          <ul
            className="flex max-h-[60vh] flex-col divide-y divide-line overflow-y-auto"
            tabIndex={0}
            aria-label={t.direct}
          >
            {(appel?.liste ?? []).map((l) => (
              <li
                key={l.personneId}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span>
                  {l.prenom} {l.nom}
                </span>
                <span className={l.scanneLe ? 'text-ok' : 'text-muted'}>
                  {l.scanneLe
                    ? `${formatHeure(l.scanneLe)}${l.rejoue ? ` · ${t.rejoue}` : ''}`
                    : t.enAttente}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t.direct}</p>
        </Card>
      </div>
    </>
  );
}
