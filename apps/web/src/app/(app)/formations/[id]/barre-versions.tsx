'use client';

import type { Formation, Maquette } from '@scolaly/contracts';
import { Badge, Button, Dialog, DialogContent } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDateHeure } from '@/lib/format';
import { useEnvoi } from '../envoi';

const t = fr.referentiel;
const TONS = { brouillon: 'warn', publiee: 'ok', archivee: 'neutral' } as const;

/** Versions de la maquette (RG-02-04) : choix, publication, nouvelle version, archivage. */
export function BarreVersions({
  formation,
  maquette,
  vue,
}: {
  formation: Formation;
  maquette: Maquette;
  vue: string;
}) {
  const router = useRouter();
  const { erreurs, envoi, executer } = useEnvoi();
  const [publication, setPublication] = useState(false);
  const { version } = maquette;
  const url = (id: string) => `/formations/${formation.id}?version=${id}&vue=${vue}`;

  async function nouvelleVersion() {
    const resultat = await executer(`/api/maquettes/${version.id}/nouvelle-version`, 'POST');
    if (resultat.ok) router.push(url((resultat.body as Maquette).version.id));
  }

  return (
    <section aria-labelledby="titre-versions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titre-versions" className="sr-only">
            {t.versions}
          </h2>
          <ul className="flex flex-wrap gap-1" aria-label={t.choixVersion}>
            {maquette.versions.map((v) => (
              <li key={v.id}>
                <Link
                  href={url(v.id)}
                  aria-current={v.id === version.id ? 'true' : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft md:min-h-9"
                >
                  {t.version(v.numero)}
                  <Badge tone={TONS[v.statut]}>{t.statutsVersion[v.statut]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {maquette.publiable ? (
            <Button
              onClick={() => {
                setPublication(true);
              }}
            >
              {t.publier}
            </Button>
          ) : null}
          {formation.modifiable ? (
            <Button variant="secondary" disabled={envoi} onClick={() => void nouvelleVersion()}>
              {t.nouvelleVersion}
            </Button>
          ) : null}
          {formation.modifiable && version.statut !== 'archivee' ? (
            <Button
              variant="ghost"
              disabled={envoi}
              onClick={() => void executer(`/api/maquettes/${version.id}/archivage`, 'POST')}
            >
              {t.archiverVersion}
            </Button>
          ) : null}
        </div>
      </div>
      {version.statut === 'publiee' ? (
        <p className="text-sm text-muted">
          {version.publieeLe ? `${formatDateHeure(version.publieeLe)} · ` : ''}
          {t.versionPubliee}
        </p>
      ) : null}
      {version.statut === 'archivee' ? (
        <p className="text-sm text-muted">{t.versionArchivee}</p>
      ) : null}
      <MessageErreur erreurs={erreurs} />

      <Dialog
        open={publication}
        onOpenChange={(open) => {
          if (!open) setPublication(false);
        }}
      >
        <DialogContent title={`${t.publier} · ${t.version(version.numero)}`}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{t.confirmerPublication}</p>
            <MessageErreur erreurs={erreurs} />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPublication(false);
                }}
              >
                {t.annuler}
              </Button>
              <Button
                disabled={envoi}
                onClick={() =>
                  void executer(`/api/maquettes/${version.id}/publication`, 'POST').then((r) => {
                    if (r.ok) setPublication(false);
                  })
                }
              >
                {t.publier}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
