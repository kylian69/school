'use client';

import type { Demarrage } from '@scolaly/contracts';
import { Badge, Button, Card, cn } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.demarrage;
const TONS = { faite: 'ok', sautee: 'neutral', 'a-faire': 'warn' } as const;

/** Anneau d'avancement de la maquette « Démarrage et apparence ». */
export function AnneauAvancement({ avancement }: { avancement: number }) {
  return (
    <div
      role="img"
      aria-label={t.avancementLong(avancement)}
      className="flex size-16 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) ${avancement * 3.6}deg, var(--surface2) 0deg)`,
      }}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-sm font-semibold tabular-nums">
        {t.avancement(avancement)}
      </span>
    </div>
  );
}

function resume(demarrage: Demarrage, code: Demarrage['etapes'][number]['code']): string {
  const c = demarrage.constats;
  switch (code) {
    case 'organisation':
      return t.resumes.organisation(c.etablissementsComplets);
    case 'calendrier':
      return t.resumes.calendrier(c.annees, c.fermetures);
    case 'apparence':
      return t.resumes.apparence(c.couleur, c.logo);
    case 'roles':
      return t.resumes.roles(c.roles, c.personnesAvecRole);
  }
}

export function EtapesDemarrage({ demarrage }: { demarrage: Demarrage }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisir(code: string, choix: 'faite' | 'sautee' | null) {
    const resultat = await envoyer(`/api/demarrage/etapes/${code}`, 'PUT', { choix }, t.erreur);
    setErreur(resultat.ok ? null : resultat.erreur);
    if (resultat.ok) router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <AnneauAvancement avancement={demarrage.avancement} />
        <p className="text-sm text-muted">{t.avancementLong(demarrage.avancement)}</p>
      </div>
      <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
        {erreur}
      </p>
      <ol className="flex flex-col divide-y divide-line">
        {demarrage.etapes.map((etape, rang) => (
          <li key={etape.code} className="flex flex-wrap items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                etape.statut === 'faite' ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted',
              )}
            >
              {etape.statut === 'faite' ? '✓' : rang + 1}
            </span>
            <div className="flex min-w-0 grow flex-col">
              <Link
                href={t.liens[etape.code]}
                aria-label={t.ouvrir(t.etapes[etape.code])}
                className="text-sm font-semibold hover:underline"
              >
                {t.etapes[etape.code]}
              </Link>
              <span className="text-xs text-muted">{resume(demarrage, etape.code)}</span>
            </div>
            <Badge tone={TONS[etape.statut]}>{t.statuts[etape.statut]}</Badge>
            {etape.automatique ? null : etape.statut === 'a-faire' ? (
              <span className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={`${t.marquerFaite} : ${t.etapes[etape.code]}`}
                  onClick={() => void choisir(etape.code, 'faite')}
                >
                  {t.marquerFaite}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`${t.passer} : ${t.etapes[etape.code]}`}
                  onClick={() => void choisir(etape.code, 'sautee')}
                >
                  {t.passer}
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                aria-label={`${t.reprendre} : ${t.etapes[etape.code]}`}
                onClick={() => void choisir(etape.code, null)}
              >
                {t.reprendre}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
