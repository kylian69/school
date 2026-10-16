'use client';

import {
  AppelEnDirect,
  FeuilleAppel,
  genererJeton,
  OuvertureAppel,
  type AppelEnDirect as Appel,
  type OuvertureAppel as Ouverture,
  type VersionAppel,
} from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { BoutonPdf } from '@/components/telecharger-pdf';
import { fr } from '@/i18n/fr';
import { formatDateHeure, formatHeure } from '@/lib/format';
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
  const [commentaire, setCommentaire] = useState('');
  const [validation, setValidation] = useState<{ enCours: boolean; erreur: string | null }>({
    enCours: false,
    erreur: null,
  });
  const [versions, setVersions] = useState<VersionAppel[]>([]);
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

  // RG-06-13 : historique des versions, relu à chaque nouvelle validation.
  const versionCourante = appel?.validation?.version ?? 0;
  useEffect(() => {
    if (versionCourante === 0) return;
    void fetch(`/api/seances/${seanceId}/appel/feuille`)
      .then(async (reponse) => FeuilleAppel.safeParse(reponse.ok ? await reponse.json() : null))
      .then((lu) => {
        if (lu.success) setVersions(lu.data.versions);
      })
      .catch(() => {
        // Sans réseau : la dernière validation reste affichée.
      });
  }, [seanceId, versionCourante]);

  const valider = async () => {
    setValidation({ enCours: true, erreur: null });
    const resultat = await envoyer(
      `/api/seances/${seanceId}/appel/validation`,
      'POST',
      commentaire.trim() ? { commentaire } : {},
      t.validationEchec,
    );
    const lu = resultat.ok ? AppelEnDirect.safeParse(resultat.body) : null;
    if (!lu?.success) {
      setValidation({ enCours: false, erreur: resultat.ok ? t.validationEchec : resultat.erreur });
      return;
    }
    setValidation({ enCours: false, erreur: null });
    setAppel(lu.data);
  };

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
  const { mode } = ouverture.donnees;
  // RG-06-13 : un appel validé ou verrouillé ne se scanne plus ; seul le QR disparaît.
  const sansQr = manuel || appel?.etat === 'valide' || appel?.etat === 'verrouille';

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
        {mode !== 'presentiel' ? (
          // RG-06-08 : à distance, le QR est partagé dans la visio ; le code sert sur le même appareil.
          <div className="flex flex-col gap-1 rounded-control bg-accent-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              {t.visioTitre}
              <Badge tone="accent">{mode === 'hybride' ? t.hybride : t.distanciel}</Badge>
            </p>
            <p>{t.visioIntervenant[mode]}</p>
          </div>
        ) : null}
        {appel?.etat === 'valide' || appel?.etat === 'verrouille' ? null : (
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
        )}
      </div>
      <div
        className={sansQr ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}
      >
        <Card className={sansQr ? 'hidden' : 'flex flex-col items-center gap-3 text-center'}>
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
            <p className="max-w-sm text-xs text-muted">
              {mode === 'presentiel' ? t.codeAide : t.codeAideVisio}
            </p>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <ListeAppel
            seanceId={seanceId}
            debut={Date.parse(ouverture.donnees.debut)}
            hybride={mode === 'hybride'}
            appel={appel}
            surAppel={setAppel}
          />
        </Card>
        <Card className="flex flex-col gap-3" aria-labelledby="etat-appel">
          <h2 id="etat-appel" className="text-lg font-semibold">
            {t.etatsAppel[appel?.etat ?? 'ouvert']}
          </h2>
          {appel?.validation ? (
            <p className="text-sm">
              {t.valideLe(
                formatDateHeure(appel.validation.valideLe),
                appel.validation.validePar,
                appel.validation.version,
              )}
              <br />
              <span className="font-mono text-xs text-muted">
                {t.empreinte(appel.validation.empreinte.slice(0, 16))}
              </span>
            </p>
          ) : null}
          {appel?.etat === 'verrouille' ? (
            <p className="text-sm text-muted">
              {appel.correctionVerrouillee ? t.verrouilleCorrigibleAide : t.verrouilleAide}
            </p>
          ) : null}
          {appel?.etat === 'a-venir' ? <p className="text-sm text-muted">{t.aVenirAide}</p> : null}
          {appel?.etat === 'ouvert' ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(evenement) => {
                evenement.preventDefault();
                void valider();
              }}
            >
              <p className="text-sm text-muted">{t.validerAide}</p>
              <label className="flex flex-col gap-1 text-sm">
                <span>{t.commentaire}</span>
                <textarea
                  value={commentaire}
                  maxLength={1000}
                  rows={2}
                  onChange={(evenement) => {
                    setCommentaire(evenement.target.value);
                  }}
                  className="rounded-control border border-line bg-surface p-2"
                />
              </label>
              {validation.erreur ? (
                <p role="alert" className="text-sm text-bad">
                  {validation.erreur}
                </p>
              ) : null}
              <Button type="submit" disabled={validation.enCours}>
                {t.validerAppel}
              </Button>
            </form>
          ) : null}
          {versions.length > 0 ? (
            <div className="flex flex-col gap-1 text-sm">
              <h3 className="font-medium">{t.versions}</h3>
              <ol className="flex flex-col gap-1 text-muted">
                {versions.map((v) => (
                  <li key={v.version}>
                    {t.version(v.version, formatDateHeure(v.valideLe), v.validePar, v.motif)}
                    {v.correctionVerrouillee ? (
                      <>
                        {' '}
                        <Badge
                          tone={v.correctionVerrouillee === 'intervenant' ? 'warn' : 'neutral'}
                        >
                          {t.correctionVerrouilleeBadge[v.correctionVerrouillee]}
                        </Badge>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
              <BoutonPdf
                url={`/api/seances/${seanceId}/appel/feuille/pdf`}
                libelle={fr.feuilles.feuilleSeance}
              />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
