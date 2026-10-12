'use client';

import {
  AppelEnDirect,
  genererJeton,
  OuvertureAppel,
  type AppelEnDirect as Appel,
  type OuvertureAppel as Ouverture,
} from '@scolaly/contracts';
import { Button, Card } from '@scolaly/ui';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { ListeAppel } from './liste-appel';

const t = fr.emargement;

/**
 * Écran de l'intervenant. Le QR et le code sont calculés ici, sans appel au serveur (RG-00-16),
 * avec l'horloge corrigée par l'heure du serveur ; la liste suit le flux en direct, et chaque
 * apprenant peut être marqué à la main (US-06-04, US-06-05).
 */
export function EcranAppel({ seanceId }: { seanceId: string }) {
  const [ouverture, setOuverture] = useState<{ donnees: Ouverture; decalage: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; code: string; changeA: number } | null>(null);
  const [reste, setReste] = useState(15);
  const [appel, setAppel] = useState<Appel | null>(null);
  const [manuel, setManuel] = useState(false);

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
        <div>
          {/* US-06-05 : appel à la main, sans QR (panne, petit groupe). */}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setManuel(!manuel);
            }}
          >
            {manuel ? t.afficherQr : t.appelManuel}
          </Button>
        </div>
      </div>
      <div
        className={manuel ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}
      >
        <Card className={manuel ? 'hidden' : 'flex flex-col items-center gap-3 text-center'}>
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
          <ListeAppel
            seanceId={seanceId}
            debut={Date.parse(ouverture.donnees.debut)}
            appel={appel}
            surAppel={setAppel}
          />
        </Card>
      </div>
    </>
  );
}
