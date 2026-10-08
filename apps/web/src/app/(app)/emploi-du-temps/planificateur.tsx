'use client';

import type { Seance, SemaineEdt } from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatHeure } from '@/lib/format';
import { useEnvoi } from '../formations/envoi';
import { cleForcage, ListeConflits, type Noms } from './conflits';
import { AnnulationSeance, FormulaireSeance } from './formulaire-seance';
import {
  auPas,
  disposer,
  grilleAffichee,
  HAUTEUR_HEURE,
  heureDe,
  instantLocal,
  partiesLocales,
} from './semaine';
import type { Defaut, Droits, Horaire, Referentiels } from './types';

const t = fr.edt;

/** Couleurs des types de séance (maquette « Emploi du temps — semaine »). */
const COULEURS_TYPE: Record<string, string> = {
  cm: 'bg-accent-soft text-accent',
  td: 'bg-teal-soft text-teal',
  tp: 'bg-teal-soft text-teal',
  projet: 'bg-surface-2 text-muted',
  examen: 'bg-warn-soft text-warn',
};

const libelleJour = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

type Dialogue =
  | { mode: 'creation' }
  | { mode: 'modification'; seance: Seance; horaire?: Horaire }
  | { mode: 'annulation'; seance: Seance };

/** E-04-01 · Grille de la semaine, fiche de la séance choisie et actions. */
export function Planificateur({
  semaine,
  titre,
  referentiels,
  defaut,
  droits,
}: {
  semaine: SemaineEdt;
  titre: string;
  referentiels: Referentiels;
  defaut: Defaut;
  droits: Droits;
}) {
  const { fuseau } = semaine;
  const [choisie, setChoisie] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { erreurs, envoi, executer } = useEnvoi();
  const prise = useRef(0);

  const noms = useMemo<Noms>(() => {
    const groupes = new Map<string, string>();
    for (const p of referentiels.promotions) {
      groupes.set(p.id, p.libelle);
      for (const g of p.groupes) groupes.set(g.id, g.libelle);
    }
    const intervenants = new Map(referentiels.intervenants.map((i) => [i.id, i.nom]));
    const seances = new Map(semaine.seances.map((s) => [s.id, s.libelle]));
    return {
      seance: (id) => seances.get(id) ?? null,
      intervenant: (id) => intervenants.get(id) ?? null,
      groupe: (id) => groupes.get(id) ?? null,
    };
  }, [referentiels, semaine.seances]);
  const salles = useMemo(
    () => new Map(referentiels.salles.map((s) => [s.id, s.nom])),
    [referentiels.salles],
  );

  const placees = semaine.seances.map((s) => {
    const debut = partiesLocales(s.debut, fuseau);
    const fin = partiesLocales(s.fin, fuseau);
    return {
      seance: s,
      id: s.id,
      jour: debut.jour,
      debut: debut.minutes,
      fin: fin.jour === debut.jour ? fin.minutes : 24 * 60,
    };
  });
  const { jours, ...plage } = grilleAffichee(semaine.debut, semaine.plage, placees);
  const heures = Array.from(
    { length: (plage.fin - plage.debut) / 60 },
    (_, n) => plage.debut + n * 60,
  );
  const hauteur = ((plage.fin - plage.debut) / 60) * HAUTEUR_HEURE;
  const enConflit = semaine.seances.filter(
    (s) =>
      s.statut !== 'annulee' &&
      s.conflits.some(
        (c) =>
          c.niveau === 'bloquant' &&
          !(
            'seanceId' in c &&
            s.forcages.some(
              (f) => cleForcage(f.code, f.seanceId) === cleForcage(c.code, c.seanceId),
            )
          ),
      ),
  ).length;
  const brouillons = semaine.seances.filter((s) => s.statut === 'brouillon' && s.modifiable);
  const seance = semaine.seances.find((s) => s.id === choisie) ?? null;
  const deplacable = (s: Seance) =>
    droits.gerer && s.modifiable && s.statut !== 'annulee' && s.statut !== 'reportee';

  async function publier(ids: string[]) {
    setMessage(null);
    const resultat = await executer('/api/edt/publication', 'POST', { seanceIds: ids });
    if (resultat.ok) setMessage(t.publiees(ids.length));
  }

  function deposer(event: DragEvent<HTMLElement>, jour: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const s = semaine.seances.find((x) => x.id === id);
    if (!s || !deplacable(s)) return;
    const zone = event.currentTarget.getBoundingClientRect();
    const minutes = auPas(
      plage.debut + ((event.clientY - zone.top - prise.current) / HAUTEUR_HEURE) * 60,
    );
    const duree = Date.parse(s.fin) - Date.parse(s.debut);
    const debut = instantLocal(
      jour,
      heureDe(Math.max(plage.debut, Math.min(minutes, 24 * 60 - 15))),
      fuseau,
    );
    setDialogue({
      mode: 'modification',
      seance: s,
      horaire: { debut, fin: new Date(Date.parse(debut) + duree).toISOString() },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {droits.gerer ? (
          <Button
            type="button"
            onClick={() => {
              setDialogue({ mode: 'creation' });
            }}
          >
            {t.nouvelle}
          </Button>
        ) : null}
        {droits.gerer && brouillons.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={envoi}
            onClick={() => void publier(brouillons.map((s) => s.id))}
          >
            {t.publierSemaine(brouillons.length)}
          </Button>
        ) : null}
        <ul aria-label={t.legende} className="flex flex-wrap items-center gap-1.5">
          {(['cm', 'td', 'tp', 'projet', 'examen'] as const).map((type) => (
            <li
              key={type}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${COULEURS_TYPE[type] ?? ''}`}
            >
              {t.types[type]}
            </li>
          ))}
        </ul>
        {enConflit > 0 ? <Badge tone="bad">{t.conflitsAResoudre(enConflit)}</Badge> : null}
      </div>
      <MessageErreur erreurs={erreurs} />
      {message ? (
        <p role="status" className="text-sm text-ok">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 p-0">
          <div role="region" aria-label={t.grille(titre)} tabIndex={0} className="overflow-x-auto">
            <div
              className="grid min-w-[720px]"
              style={{
                gridTemplateColumns: `56px repeat(${String(jours.length)}, minmax(0, 1fr))`,
              }}
            >
              <div aria-hidden className="border-b border-line" />
              {jours.map((jour) => (
                <h2
                  key={jour}
                  id={`jour-${jour}`}
                  className="border-b border-l border-line px-2 py-2 text-sm font-semibold capitalize"
                >
                  {libelleJour.format(new Date(`${jour}T00:00:00Z`))}
                </h2>
              ))}
              <div aria-hidden className="relative" style={{ height: hauteur }}>
                {heures.map((h) => (
                  <span
                    key={h}
                    className="absolute right-2 text-xs text-muted num"
                    style={{ top: ((h - plage.debut) / 60) * HAUTEUR_HEURE - 6 }}
                  >
                    {heureDe(h)}
                  </span>
                ))}
              </div>
              {jours.map((jour) => {
                const duJour = disposer(placees.filter((p) => p.jour === jour));
                return (
                  <section
                    key={jour}
                    aria-labelledby={`jour-${jour}`}
                    className="relative border-l border-line"
                    style={{
                      height: hauteur,
                      backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px)',
                      backgroundSize: `100% ${String(HAUTEUR_HEURE)}px`,
                    }}
                    onDragOver={(e) => {
                      if (droits.gerer) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      deposer(e, jour);
                    }}
                  >
                    {duJour.length === 0 ? null : (
                      <ul>
                        {duJour.map((p) => {
                          const s = p.seance;
                          const salle = s.salleId ? (salles.get(s.salleId) ?? null) : null;
                          const bloquants = s.conflits.filter((c) => c.niveau === 'bloquant');
                          const horaire = `${formatHeure(s.debut, fuseau)} – ${formatHeure(s.fin, fuseau)}`;
                          return (
                            <li
                              key={s.id}
                              className="absolute px-0.5"
                              style={{
                                top: ((p.debut - plage.debut) / 60) * HAUTEUR_HEURE,
                                height: Math.max(24, ((p.fin - p.debut) / 60) * HAUTEUR_HEURE),
                                left: `${String((p.colonne / p.colonnes) * 100)}%`,
                                width: `${String(100 / p.colonnes)}%`,
                              }}
                            >
                              <button
                                type="button"
                                draggable={deplacable(s)}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', s.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  prise.current =
                                    e.clientY - e.currentTarget.getBoundingClientRect().top;
                                }}
                                onClick={() => {
                                  setChoisie(s.id);
                                }}
                                aria-pressed={choisie === s.id}
                                aria-label={t.resume(
                                  s.libelle,
                                  horaire,
                                  t.statuts[s.statut],
                                  salle,
                                  bloquants.length,
                                )}
                                className={`flex size-full flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-xs ${
                                  COULEURS_TYPE[s.type ?? 'projet'] ?? ''
                                } ${s.statut === 'brouillon' ? 'border border-dashed border-current' : ''} ${
                                  s.statut === 'annulee' ? 'line-through opacity-70' : ''
                                } ${bloquants.length > 0 ? 'ring-2 ring-bad' : ''} ${
                                  choisie === s.id
                                    ? 'outline-2 outline-offset-1 outline-accent'
                                    : ''
                                }`}
                              >
                                <span className="num">{horaire}</span>
                                <span className="font-semibold text-fg">{s.libelle}</span>
                                {salle ? <span>{salle}</span> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          {semaine.seances.length === 0 ? (
            <p className="border-t border-line px-4 py-3 text-sm text-muted">{t.aucuneSeance}</p>
          ) : null}
          {droits.gerer ? (
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              {t.deposer} {t.astuceClavier}
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3 self-start" aria-label={t.fiche.titre} role="region">
          {seance ? (
            <FicheSeance
              seance={seance}
              fuseau={fuseau}
              noms={noms}
              salle={seance.salleId ? (salles.get(seance.salleId) ?? null) : null}
              droits={droits}
              envoi={envoi}
              onModifier={() => {
                setDialogue({ mode: 'modification', seance });
              }}
              onAnnuler={() => {
                setDialogue({ mode: 'annulation', seance });
              }}
              onPublier={() => void publier([seance.id])}
              onFermer={() => {
                setChoisie(null);
              }}
            />
          ) : (
            <p className="text-sm text-muted">{t.fiche.vide}</p>
          )}
        </Card>
      </div>

      {dialogue?.mode === 'annulation' ? (
        <AnnulationSeance
          seance={dialogue.seance}
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : dialogue ? (
        <FormulaireSeance
          seance={dialogue.mode === 'modification' ? dialogue.seance : null}
          horaire={dialogue.mode === 'modification' ? dialogue.horaire : undefined}
          jourParDefaut={semaine.debut}
          fuseau={fuseau}
          referentiels={referentiels}
          defaut={defaut}
          droits={droits}
          noms={noms}
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FicheSeance({
  seance,
  fuseau,
  noms,
  salle,
  droits,
  envoi,
  onModifier,
  onAnnuler,
  onPublier,
  onFermer,
}: {
  seance: Seance;
  fuseau: string;
  noms: Noms;
  salle: string | null;
  droits: Droits;
  envoi: boolean;
  onModifier: () => void;
  onAnnuler: () => void;
  onPublier: () => void;
  onFermer: () => void;
}) {
  const jour = partiesLocales(seance.debut, fuseau).jour;
  const forces = new Set(seance.forcages.map((f) => cleForcage(f.code, f.seanceId)));
  const publique = [...seance.promotionIds, ...seance.groupeIds]
    .map((id) => noms.groupe(id))
    .filter(Boolean)
    .join(', ');
  const actif = seance.statut !== 'annulee' && seance.statut !== 'reportee';
  const lignes: [string, string][] = [
    [t.fiche.statut, t.statuts[seance.statut]],
    [seance.moduleId ? t.fiche.module : t.fiche.activite, seance.libelle],
    [t.fiche.public, publique || t.fiche.aucun],
    [
      t.fiche.intervenant,
      seance.intervenantIds.length > 0
        ? seance.intervenantIds
            .map((id) => noms.intervenant(id) ?? t.conflits.unIntervenant)
            .sort((a, b) => a.localeCompare(b, 'fr'))
            .join(', ')
        : t.fiche.aucun,
    ],
    [t.fiche.salle, salle ?? (seance.distanciel ? t.distanciel : t.fiche.aucun)],
  ];
  if (seance.lienVisio) lignes.push([t.fiche.visio, seance.lienVisio]);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Badge tone="accent" className="self-start">
            {seance.type ? t.types[seance.type] : t.sansType}
          </Badge>
          <h2 className="text-lg font-semibold">{seance.libelle}</h2>
          <p className="text-sm text-muted num">
            {t.horaire(
              libelleJour.format(new Date(`${jour}T00:00:00Z`)),
              formatHeure(seance.debut, fuseau),
              formatHeure(seance.fin, fuseau),
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.fiche.fermer}
          onClick={onFermer}
        >
          ×
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="text-muted">{terme}</dt>
            <dd className="break-words">{valeur}</dd>
          </div>
        ))}
      </dl>
      {seance.serieId ? <p className="text-xs text-muted">{t.fiche.serie}</p> : null}
      {seance.motifAnnulation ? (
        <p className="text-sm">{t.fiche.motifAnnulation(seance.motifAnnulation)}</p>
      ) : null}
      <h3 className="text-sm font-semibold">{t.fiche.conflits}</h3>
      {seance.conflits.length === 0 ? (
        <p className="text-sm text-muted">{t.fiche.sansConflit}</p>
      ) : (
        <ListeConflits
          conflits={seance.conflits}
          noms={noms}
          forces={forces}
          titre={t.fiche.conflits}
        />
      )}
      {seance.forcages.length > 0 ? (
        <>
          <h3 className="text-sm font-semibold">{t.fiche.forcages}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {seance.forcages.map((f) => (
              <li key={cleForcage(f.code, f.seanceId)}>{t.fiche.forcage(f.motif)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {!seance.modifiable ? (
        <p className="text-xs text-muted">{t.fiche.lectureSeule}</p>
      ) : droits.gerer && actif ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onModifier}>
            {t.fiche.modifier}
          </Button>
          {seance.statut === 'brouillon' ? (
            <Button type="button" disabled={envoi} onClick={onPublier}>
              {t.fiche.publier}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onAnnuler}>
            {t.fiche.annuler}
          </Button>
        </div>
      ) : null}
    </>
  );
}
