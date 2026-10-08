'use client';

import {
  ApercuSerie,
  CONFLITS_FORCABLES,
  PORTEES_MODIFICATION,
  ResultatVerification,
  TYPES_SEANCE,
  type ForcageConflit,
  type Seance,
} from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import { useEffect, useId, useMemo, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate, formatHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { SELECT, useEnvoi } from '../formations/envoi';
import { cleForcage, ListeConflits, type Noms } from './conflits';
import { heureDe, instantLocal, jourIso, minutesDe, partiesLocales } from './semaine';
import type { Defaut, Droits, Horaire, Referentiels } from './types';

const t = fr.edt;
const f = t.formulaire;
type TypeSeance = (typeof TYPES_SEANCE)[number];
type Portee = (typeof PORTEES_MODIFICATION)[number];

const HORS_MAQUETTE = 'hors-maquette';
const DELAI_VERIFICATION = 300;

function Dialogue({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={titre} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * US-04-01, US-04-02 : créer une séance ou une série, ou modifier une séance (RG-04-03), avec la
 * vérification des conflits en direct (RG-04-05), les solutions (RG-04-07) et le forçage motivé
 * des conflits de salle ou de groupe (RG-04-06).
 */
export function FormulaireSeance({
  seance,
  horaire,
  jourParDefaut,
  fuseau,
  referentiels,
  defaut,
  droits,
  noms,
  onFermer,
}: {
  seance: Seance | null;
  horaire?: Horaire | undefined;
  jourParDefaut: string;
  fuseau: string;
  referentiels: Referentiels;
  defaut: Defaut;
  droits: Droits;
  noms: Noms;
  onFermer: () => void;
}) {
  const ids = {
    type: useId(),
    module: useId(),
    salle: useId(),
    portee: useId(),
    intervalle: useId(),
  };
  const { erreurs, envoi, executer } = useEnvoi();
  const initial = horaire ?? (seance ? { debut: seance.debut, fin: seance.fin } : null);
  const debutInitial = initial ? partiesLocales(initial.debut, fuseau) : null;
  const [jour, setJour] = useState(debutInitial?.jour ?? jourParDefaut);
  const [heureDebut, setHeureDebut] = useState(
    debutInitial ? heureDe(debutInitial.minutes) : '09:00',
  );
  const [heureFin, setHeureFin] = useState(
    initial ? heureDe(partiesLocales(initial.fin, fuseau).minutes) : '12:00',
  );
  const [type, setType] = useState<TypeSeance>(seance?.type ?? 'cm');
  const [moduleId, setModuleId] = useState(seance ? (seance.moduleId ?? HORS_MAQUETTE) : '');
  const [activite, setActivite] = useState(seance?.activite ?? '');
  const [promotionIds, setPromotionIds] = useState(seance?.promotionIds ?? defaut.promotionIds);
  const [groupeIds, setGroupeIds] = useState(seance?.groupeIds ?? defaut.groupeIds);
  const [intervenantIds, setIntervenantIds] = useState(
    seance ? seance.intervenantIds : defaut.intervenantIds,
  );
  const [salleId, setSalleId] = useState((seance ? seance.salleId : defaut.salleId) ?? '');
  const [lienVisio, setLienVisio] = useState(seance?.lienVisio ?? '');
  const [distanciel, setDistanciel] = useState(seance?.distanciel ?? false);
  const [portee, setPortee] = useState<Portee>('seance');
  const [serie, setSerie] = useState(false);
  const [joursSemaine, setJoursSemaine] = useState<number[]>([jourIso(jour)]);
  const [intervalle, setIntervalle] = useState('1');
  const [jusquAu, setJusquAu] = useState('');
  const [sauterEntreprise, setSauterEntreprise] = useState(true);
  const [apercu, setApercu] = useState<ApercuSerie | null>(null);
  const [forcages, setForcages] = useState<Record<string, string>>(
    Object.fromEntries(
      (seance?.forcages ?? []).map((x) => [cleForcage(x.code, x.seanceId), x.motif]),
    ),
  );
  const [verification, setVerification] = useState<
    { etat: 'attente' } | { etat: 'echec' } | { etat: 'ok'; resultat: ResultatVerification } | null
  >(null);

  // Groupes d'une promotion du public : les modules de leur maquette sont proposés.
  const promotionsDuPublic = referentiels.promotions.filter(
    (p) => promotionIds.includes(p.id) || p.groupes.some((g) => groupeIds.includes(g.id)),
  );
  const modules = [
    ...new Map(promotionsDuPublic.flatMap((p) => p.modules.map((m) => [m.id, m]))).values(),
  ];
  // Intervenants proposés, plus ceux déjà sur la séance s'ils ne sont plus affectés.
  const listeIntervenants = [
    ...referentiels.intervenants,
    ...intervenantIds
      .filter((id) => !referentiels.intervenants.some((i) => i.id === id))
      .map((id) => ({ id, nom: noms.intervenant(id) ?? t.conflits.unIntervenant })),
  ];
  const horaireChange = portee === 'seance';
  const debut = instantLocal(jour, heureDebut, fuseau);
  const fin = instantLocal(jour, heureFin, fuseau);
  const contenu = useMemo(
    () => ({
      type,
      moduleId: moduleId && moduleId !== HORS_MAQUETTE ? moduleId : null,
      activite: moduleId === HORS_MAQUETTE ? activite.trim() || null : null,
      promotionIds,
      groupeIds,
      intervenantIds: [...intervenantIds].sort(),
      salleId: salleId || null,
      lienVisio: lienVisio.trim() || null,
      distanciel,
    }),
    [
      type,
      moduleId,
      activite,
      promotionIds,
      groupeIds,
      intervenantIds,
      salleId,
      lienVisio,
      distanciel,
    ],
  );
  const resultat = verification?.etat === 'ok' ? verification.resultat : null;
  // RG-04-06 : seuls les nouveaux forçages de conflits encore présents, séance par séance.
  const dejaForces = new Set((seance?.forcages ?? []).map((x) => cleForcage(x.code, x.seanceId)));
  const listeForcages: ForcageConflit[] =
    portee === 'seance' && resultat
      ? resultat.conflits.flatMap((c) => {
          if (!('seanceId' in c) || (c.code !== 'salle-occupee' && c.code !== 'groupe-occupe'))
            return [];
          const cle = cleForcage(c.code, c.seanceId);
          const motif = forcages[cle];
          return motif === undefined || dejaForces.has(cle)
            ? []
            : [{ code: c.code, seanceId: c.seanceId, motif }];
        })
      : [];

  // RG-04-05 : contrôle en direct du créneau envisagé (sans enregistrer).
  useEffect(() => {
    if (contenu.promotionIds.length + contenu.groupeIds.length === 0) return;
    if (minutesDe(heureFin) <= minutesDe(heureDebut)) return;
    let annule = false;
    const minuteur = setTimeout(() => {
      setVerification({ etat: 'attente' });
      void envoyer('/api/edt/verification', 'POST', {
        ...contenu,
        ...(seance ? { id: seance.id } : {}),
        debut,
        fin,
      }).then((r) => {
        if (annule) return;
        const resultat = r.ok ? ResultatVerification.safeParse(r.body) : null;
        setVerification(
          resultat?.success ? { etat: 'ok', resultat: resultat.data } : { etat: 'echec' },
        );
      });
    }, DELAI_VERIFICATION);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [contenu, debut, fin, heureDebut, heureFin, seance]);

  async function voirApercu() {
    const r = await envoyer('/api/edt/series/apercu', 'POST', corpsSerie());
    const lu = r.ok ? ApercuSerie.safeParse(r.body) : null;
    setApercu(lu?.success ? lu.data : null);
  }

  function corpsSerie() {
    return {
      ...contenu,
      dateDebut: jour,
      dateFin: jusquAu,
      joursSemaine,
      intervalleSemaines: Number(intervalle) || 1,
      heureDebut,
      heureFin,
      sauterJoursEntreprise: sauterEntreprise,
    };
  }

  /** Modification : seuls les champs changés, pour ne pas écraser le reste de la série. */
  function corpsModification(s: Seance) {
    const corps: Record<string, unknown> = { portee, forcages: listeForcages };
    if (horaireChange && (debut !== s.debut || fin !== s.fin)) Object.assign(corps, { debut, fin });
    const avant = {
      type: s.type,
      moduleId: s.moduleId,
      activite: s.activite,
      promotionIds: s.promotionIds,
      groupeIds: s.groupeIds,
      intervenantIds: s.intervenantIds,
      salleId: s.salleId,
      lienVisio: s.lienVisio,
      distanciel: s.distanciel,
    };
    for (const [cle, valeur] of Object.entries(contenu))
      if (JSON.stringify(valeur) !== JSON.stringify(avant[cle as keyof typeof avant]))
        corps[cle] = valeur;
    return corps;
  }

  async function enregistrer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultat = seance
      ? await executer(`/api/edt/seances/${seance.id}`, 'PATCH', corpsModification(seance))
      : serie
        ? await executer('/api/edt/series', 'POST', corpsSerie())
        : await executer('/api/edt/seances', 'POST', {
            ...contenu,
            debut,
            fin,
            forcages: listeForcages,
          });
    if (resultat.ok) onFermer();
  }

  const basculer = (liste: string[], id: string, coche: boolean) =>
    coche ? [...liste, id] : liste.filter((x) => x !== id);

  return (
    <Dialogue
      titre={seance ? (horaire ? f.deplacement : f.modification) : f.creation}
      onFermer={onFermer}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void enregistrer(e)}>
        {seance?.serieId ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.portee}>{f.portee}</Label>
            <select
              id={ids.portee}
              className={SELECT}
              value={portee}
              onChange={(e) => {
                setPortee(e.target.value as Portee);
              }}
            >
              {PORTEES_MODIFICATION.map((p) => (
                <option key={p} value={p}>
                  {f.portees[p]}
                </option>
              ))}
            </select>
            {!horaireChange ? <p className="text-xs text-muted">{f.porteeHoraire}</p> : null}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ
            nom="debut"
            label={f.date}
            erreurs={erreurs}
            type="date"
            required
            disabled={!horaireChange}
            value={jour}
            onChange={(e) => {
              setJour(e.target.value);
            }}
          />
          <Champ
            nom="heureDebut"
            label={f.debut}
            erreurs={erreurs}
            type="time"
            step={900}
            required
            disabled={!horaireChange}
            value={heureDebut}
            onChange={(e) => {
              setHeureDebut(e.target.value);
            }}
          />
          <Champ
            nom="fin"
            label={f.fin}
            erreurs={erreurs}
            type="time"
            step={900}
            required
            disabled={!horaireChange}
            value={heureFin}
            onChange={(e) => {
              setHeureFin(e.target.value);
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.type}>{f.type}</Label>
            <select
              id={ids.type}
              className={SELECT}
              value={type}
              onChange={(e) => {
                setType(e.target.value as TypeSeance);
              }}
            >
              {TYPES_SEANCE.map((x) => (
                <option key={x} value={x}>
                  {t.types[x]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.module}>{f.module}</Label>
            <select
              id={ids.module}
              className={SELECT}
              required
              value={moduleId}
              onChange={(e) => {
                setModuleId(e.target.value);
              }}
            >
              <option value="" disabled>
                —
              </option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
              {seance?.moduleId && !modules.some((m) => m.id === seance.moduleId) ? (
                <option value={seance.moduleId}>{seance.libelle}</option>
              ) : null}
              <option value={HORS_MAQUETTE}>{f.horsMaquette}</option>
            </select>
          </div>
        </div>
        {moduleId === HORS_MAQUETTE ? (
          <Champ
            nom="activite"
            label={f.activite}
            aide={f.activiteAide}
            erreurs={erreurs}
            required
            maxLength={120}
            value={activite}
            onChange={(e) => {
              setActivite(e.target.value);
            }}
          />
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{f.public}</legend>
          <p className="text-xs text-muted">{f.publicAide}</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {referentiels.promotions.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <Case
                  label={f.toutePromotion(p.libelle)}
                  coche={promotionIds.includes(p.id)}
                  onChange={(coche) => {
                    setPromotionIds(basculer(promotionIds, p.id, coche));
                  }}
                />
                {p.groupes.length > 0 ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                    {p.groupes.map((g) => (
                      <li key={g.id}>
                        <Case
                          label={g.libelle}
                          coche={groupeIds.includes(g.id)}
                          onChange={(coche) => {
                            setGroupeIds(basculer(groupeIds, g.id, coche));
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{f.intervenants}</legend>
          <p className="text-xs text-muted">{f.intervenantsAide}</p>
          {listeIntervenants.length === 0 ? (
            <p className="text-sm text-muted">{f.aucunIntervenant}</p>
          ) : (
            <ul className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
              {listeIntervenants.map((i) => (
                <li key={i.id}>
                  <Case
                    label={i.nom}
                    coche={intervenantIds.includes(i.id)}
                    onChange={(coche) => {
                      setIntervenantIds(basculer(intervenantIds, i.id, coche));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.salle}>{f.salle}</Label>
            <select
              id={ids.salle}
              className={SELECT}
              value={salleId}
              onChange={(e) => {
                setSalleId(e.target.value);
              }}
            >
              <option value="">{f.aucuneSalle}</option>
              {referentiels.salles.map((s) => (
                <option key={s.id} value={s.id} disabled={s.fermee && s.id !== salleId}>
                  {s.fermee ? f.salleFermee(s.nom) : f.places(s.nom, s.capacite)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Champ
            nom="lienVisio"
            label={f.lienVisio}
            erreurs={erreurs}
            type="url"
            value={lienVisio}
            onChange={(e) => {
              setLienVisio(e.target.value);
            }}
          />
          <Case label={f.distanciel} coche={distanciel} onChange={setDistanciel} />
        </div>

        {!seance ? (
          <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
            <legend className="px-1">
              <Case
                label={f.recurrence}
                coche={serie}
                onChange={(coche) => {
                  setSerie(coche);
                  setApercu(null);
                }}
              />
            </legend>
            {serie ? (
              <>
                <fieldset>
                  <legend className="mb-1 text-sm">{f.jours}</legend>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {f.joursCourts.map((libelle, rang) => (
                      <li key={libelle}>
                        <Case
                          label={libelle}
                          coche={joursSemaine.includes(rang + 1)}
                          onChange={(coche) => {
                            setJoursSemaine(
                              coche
                                ? [...joursSemaine, rang + 1].sort()
                                : joursSemaine.filter((j) => j !== rang + 1),
                            );
                            setApercu(null);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ
                    nom="dateFin"
                    label={f.jusquAu}
                    erreurs={erreurs}
                    type="date"
                    required
                    min={jour}
                    value={jusquAu}
                    onChange={(e) => {
                      setJusquAu(e.target.value);
                      setApercu(null);
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={ids.intervalle}>{f.intervalle}</Label>
                    <Input
                      id={ids.intervalle}
                      type="number"
                      min={1}
                      max={52}
                      value={intervalle}
                      onChange={(e) => {
                        setIntervalle(e.target.value);
                        setApercu(null);
                      }}
                    />
                  </div>
                </div>
                <Case
                  label={f.sauterEntreprise}
                  coche={sauterEntreprise}
                  onChange={(coche) => {
                    setSauterEntreprise(coche);
                    setApercu(null);
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!jusquAu || joursSemaine.length === 0}
                    onClick={() => void voirApercu()}
                  >
                    {f.apercu}
                  </Button>
                  {apercu ? (
                    <p role="status" className="text-sm">
                      {f.apercuResultat(apercu.occurrences.length)}{' '}
                      {apercu.sautees.length > 0
                        ? f.sautees(
                            apercu.sautees
                              .map((s) => `${formatDate(s.jour)} (${f.raisons[s.raison]})`)
                              .join(', '),
                          )
                        : null}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </fieldset>
        ) : null}

        <section aria-labelledby={`${ids.type}-verification`} className="flex flex-col gap-2">
          <h3 id={`${ids.type}-verification`} className="text-sm font-semibold">
            {f.verification}
          </h3>
          <div aria-live="polite" className="flex flex-col gap-2">
            {verification?.etat === 'attente' ? (
              <p className="text-sm text-muted">{f.verificationEnCours}</p>
            ) : verification?.etat === 'echec' ? (
              <p className="text-sm text-warn">{f.verificationEchec}</p>
            ) : resultat && resultat.conflits.length === 0 ? (
              <p className="text-sm text-ok">{f.sansConflit}</p>
            ) : null}
          </div>
          {resultat && resultat.conflits.length > 0 ? (
            <>
              <ListeConflits
                conflits={resultat.conflits}
                noms={noms}
                forces={new Set(Object.keys(forcages))}
                titre={f.verification}
              />
              {resultat.conflits.map((c) => {
                if (!('seanceId' in c) || !CONFLITS_FORCABLES.some((code) => code === c.code))
                  return null;
                const cle = cleForcage(c.code, c.seanceId);
                if (!droits.forcer)
                  return (
                    <p key={cle} className="text-xs text-muted">
                      {f.forcageInterdit}
                    </p>
                  );
                const motif = forcages[cle];
                return (
                  <div
                    key={cle}
                    className="flex flex-col gap-2 rounded-control border border-line p-2"
                  >
                    <Case
                      label={`${f.forcer} : ${noms.seance(c.seanceId) ?? ''}`.replace(/ : $/, '')}
                      coche={motif !== undefined}
                      onChange={(coche) => {
                        setForcages(
                          coche
                            ? { ...forcages, [cle]: '' }
                            : Object.fromEntries(
                                Object.entries(forcages).filter(([k]) => k !== cle),
                              ),
                        );
                      }}
                    />
                    {motif !== undefined ? (
                      <Champ
                        nom={`motif-${cle}`}
                        label={f.motifForcage}
                        aide={f.motifForcageAide}
                        erreurs={erreurs}
                        required
                        maxLength={500}
                        value={motif}
                        onChange={(e) => {
                          setForcages({ ...forcages, [cle]: e.target.value });
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : null}
          {resultat && resultat.sallesLibres.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">{f.sallesLibres}</p>
              <ul className="flex flex-wrap gap-2">
                {resultat.sallesLibres.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSalleId(s.id);
                      }}
                    >
                      {f.utiliserSalle(s.nom, s.capacite)}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {resultat && resultat.creneauxLibres.length > 0 && horaireChange ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">{f.creneauxLibres}</p>
              <ul className="flex flex-wrap gap-2">
                {resultat.creneauxLibres.slice(0, 4).map((c) => {
                  const local = partiesLocales(c.debut, fuseau);
                  const libelle = `${formatDate(local.jour)} ${formatHeure(c.debut, fuseau)} – ${formatHeure(c.fin, fuseau)}`;
                  return (
                    <li key={c.debut}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setJour(local.jour);
                          setHeureDebut(heureDe(local.minutes));
                          setHeureFin(heureDe(partiesLocales(c.fin, fuseau).minutes));
                        }}
                      >
                        {f.utiliserCreneau(libelle)}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>

        <p className="text-xs text-muted">{f.brouillonAide}</p>
        <MessageErreur
          erreurs={erreurs}
          champs={['debut', 'fin', 'activite', 'lienVisio', 'dateFin']}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            {f.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {seance ? f.enregistrerModification : serie ? f.creerSerie : f.enregistrer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}

function Case({
  label,
  coche,
  onChange,
}: {
  label: string;
  coche: boolean;
  onChange: (coche: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={coche}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

/** RG-04-04 : annulation motivée ; les présences et les notes sont conservées. */
export function AnnulationSeance({ seance, onFermer }: { seance: Seance; onFermer: () => void }) {
  const idPortee = useId();
  const { erreurs, envoi, executer } = useEnvoi();
  const [motif, setMotif] = useState('');
  const [portee, setPortee] = useState<Portee>('seance');

  async function confirmer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultat = await executer(`/api/edt/seances/${seance.id}/annulation`, 'POST', {
      motif,
      portee,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialogue titre={t.annulation.titre} onFermer={onFermer}>
      <form className="flex flex-col gap-4" onSubmit={(e) => void confirmer(e)}>
        <p className="text-sm text-muted">{t.annulation.aide}</p>
        <p className="text-sm font-semibold">{seance.libelle}</p>
        {seance.serieId ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idPortee}>{f.portee}</Label>
            <select
              id={idPortee}
              className={SELECT}
              value={portee}
              onChange={(e) => {
                setPortee(e.target.value as Portee);
              }}
            >
              {PORTEES_MODIFICATION.map((p) => (
                <option key={p} value={p}>
                  {f.portees[p]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Champ
          nom="motif"
          label={t.annulation.motif}
          erreurs={erreurs}
          required
          maxLength={500}
          value={motif}
          onChange={(e) => {
            setMotif(e.target.value);
          }}
        />
        <MessageErreur erreurs={erreurs} champs={['motif']} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            {t.annulation.retour}
          </Button>
          <Button type="submit" variant="danger" disabled={envoi}>
            {t.annulation.confirmer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}
