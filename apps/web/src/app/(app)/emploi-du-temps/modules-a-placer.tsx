'use client';

import { TYPES_SEANCE, type ModuleAPlacer } from '@scolaly/contracts';
import { Button, Card } from '@scolaly/ui';
import { fr } from '@/i18n/fr';
import { formatDuree, PAS_MINUTES } from './semaine';
import type { ModeleSeance } from './types';

const t = fr.edt;
const FORMAT = 'application/x-scolaly-module';
/** Durée proposée pour un module déposé : 2 h, ou ce qui reste s'il en reste moins. */
const DUREE_PROPOSEE = 120;

/** Module glissé depuis la barre, avec la durée proposée en minutes ; null pour une séance. */
export function lireModuleDeplace(
  transfert: DataTransfer,
): { modele: ModeleSeance; minutes: number } | null {
  const brut = transfert.getData(FORMAT);
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as { moduleId?: unknown; type?: unknown; minutes?: unknown };
    const type = TYPES_SEANCE.find((x) => x === v.type);
    if (typeof v.moduleId !== 'string' || !type || typeof v.minutes !== 'number') return null;
    return { modele: { moduleId: v.moduleId, type }, minutes: v.minutes };
  } catch {
    return null;
  }
}

function etat(m: ModuleAPlacer) {
  const a = t.aPlacer;
  if (m.prevuMinutes === 0) return a.sansPrevu(formatDuree(m.planifieMinutes));
  if (m.restantMinutes > 0)
    return a.restant(formatDuree(m.restantMinutes), formatDuree(m.prevuMinutes));
  if (m.restantMinutes === 0) return a.complet(formatDuree(m.prevuMinutes));
  return a.depasse(formatDuree(-m.restantMinutes), formatDuree(m.prevuMinutes));
}

/**
 * E-04-01, RG-04-16 : modules de la maquette du public affiché et heures restant à placer, par
 * type. Un module se glisse sur la grille, ou se place au clavier avec « Placer ».
 */
export function ModulesAPlacer({
  modules,
  gerer,
  onDebutGlisser,
  onPlacer,
}: {
  modules: readonly ModuleAPlacer[];
  gerer: boolean;
  onDebutGlisser: () => void;
  onPlacer: (modele: ModeleSeance) => void;
}) {
  const placables = gerer && modules.some((m) => m.restantMinutes > 0);
  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="modules-a-placer">
      <div className="flex flex-col gap-1">
        <h2 id="modules-a-placer" className="text-lg font-semibold">
          {t.aPlacer.titre}
        </h2>
        <p className="text-xs text-muted">{t.aPlacer.aide}</p>
      </div>
      {modules.length === 0 ? (
        <p className="text-sm text-muted">{t.aPlacer.vide}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {modules.map((m) => {
            const libelle = `${m.code} · ${m.intitule}`;
            const aPlacer = gerer && m.restantMinutes > 0;
            const modele: ModeleSeance = { moduleId: m.moduleId, type: m.type };
            return (
              <li
                key={`${m.moduleId}-${m.type}`}
                draggable={aPlacer}
                onDragStart={(e) => {
                  const minutes = Math.max(
                    PAS_MINUTES,
                    Math.min(
                      DUREE_PROPOSEE,
                      Math.floor(m.restantMinutes / PAS_MINUTES) * PAS_MINUTES,
                    ),
                  );
                  e.dataTransfer.setData(FORMAT, JSON.stringify({ ...modele, minutes }));
                  e.dataTransfer.effectAllowed = 'copy';
                  onDebutGlisser();
                }}
                className={`flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5 text-sm ${
                  aPlacer ? 'cursor-grab' : ''
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold break-words">{libelle}</span>
                  <span
                    className={`text-xs num ${m.restantMinutes < 0 ? 'text-bad' : 'text-muted'}`}
                  >
                    <span className="font-semibold">{t.types[m.type]}</span> · {etat(m)}
                  </span>
                </div>
                {aPlacer ? (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={t.aPlacer.placer(`${libelle}, ${t.types[m.type]}`)}
                    onClick={() => {
                      onPlacer(modele);
                    }}
                  >
                    {t.aPlacer.placerCourt}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {placables ? <p className="text-xs text-muted">{t.aPlacer.glisser}</p> : null}
    </Card>
  );
}
