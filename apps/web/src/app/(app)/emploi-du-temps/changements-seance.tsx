'use client';

import { PORTEES_MODIFICATION, type Seance } from '@scolaly/contracts';
import { Button, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, useEnvoi } from '../formations/envoi';
import type { Noms } from './conflits';
import { Dialogue } from './formulaire-seance';
import { heureDe, instantLocal, partiesLocales } from './semaine';
import type { Referentiels } from './types';

const t = fr.edt;
type Portee = (typeof PORTEES_MODIFICATION)[number];

/**
 * US-04-11 : report d'une séance publiée vers un nouveau créneau. L'API crée la séance de
 * remplacement publiée et refuse un créneau en conflit bloquant (RG-04-06).
 */
export function ReportSeance({
  seance,
  fuseau,
  salles,
  onFermer,
}: {
  seance: Seance;
  fuseau: string;
  salles: Referentiels['salles'];
  onFermer: () => void;
}) {
  const idSalle = useId();
  const { erreurs, envoi, executer } = useEnvoi();
  const debut = partiesLocales(seance.debut, fuseau);
  const [jour, setJour] = useState(debut.jour);
  const [heureDebut, setHeureDebut] = useState(heureDe(debut.minutes));
  const [heureFin, setHeureFin] = useState(heureDe(partiesLocales(seance.fin, fuseau).minutes));
  const [salleId, setSalleId] = useState(seance.salleId ?? '');
  const [motif, setMotif] = useState('');

  async function confirmer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultat = await executer(`/api/edt/seances/${seance.id}/report`, 'POST', {
      motif,
      debut: instantLocal(jour, heureDebut, fuseau),
      fin: instantLocal(jour, heureFin, fuseau),
      salleId: salleId || null,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialogue titre={t.report.titre} onFermer={onFermer}>
      <form className="flex flex-col gap-4" onSubmit={(e) => void confirmer(e)}>
        <p className="text-sm text-muted">{t.report.aide}</p>
        <p className="text-sm font-semibold">{seance.libelle}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ
            nom="debut"
            label={t.report.jour}
            erreurs={erreurs}
            type="date"
            required
            value={jour}
            onChange={(e) => {
              setJour(e.target.value);
            }}
          />
          <Champ
            nom="heureDebut"
            label={t.report.debut}
            erreurs={erreurs}
            type="time"
            step={900}
            required
            value={heureDebut}
            onChange={(e) => {
              setHeureDebut(e.target.value);
            }}
          />
          <Champ
            nom="fin"
            label={t.report.fin}
            erreurs={erreurs}
            type="time"
            step={900}
            required
            value={heureFin}
            onChange={(e) => {
              setHeureFin(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idSalle}>{t.report.salle}</Label>
          <select
            id={idSalle}
            className={SELECT}
            value={salleId}
            onChange={(e) => {
              setSalleId(e.target.value);
            }}
          >
            <option value="">{t.report.sansSalle}</option>
            {salles
              .filter((s) => !s.fermee)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
          </select>
        </div>
        <Champ
          nom="motif"
          label={t.report.motif}
          erreurs={erreurs}
          required
          maxLength={500}
          value={motif}
          onChange={(e) => {
            setMotif(e.target.value);
          }}
        />
        <MessageErreur erreurs={erreurs} champs={['motif', 'debut', 'fin']} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            {t.report.retour}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.report.confirmer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}

/** US-04-11 : remplacer un intervenant ; les co-intervenants restent. */
export function RemplacementIntervenant({
  seance,
  intervenants,
  noms,
  onFermer,
}: {
  seance: Seance;
  intervenants: Referentiels['intervenants'];
  noms: Noms;
  onFermer: () => void;
}) {
  const ids = { ancien: useId(), nouveau: useId(), portee: useId() };
  const { erreurs, envoi, executer } = useEnvoi();
  const [ancienId, setAncienId] = useState(seance.intervenantIds[0] ?? '');
  const [nouveauId, setNouveauId] = useState('');
  const [portee, setPortee] = useState<Portee>('seance');
  const candidats = intervenants.filter((i) => !seance.intervenantIds.includes(i.id));

  async function confirmer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const resultat = await executer(`/api/edt/seances/${seance.id}/remplacement`, 'POST', {
      ancienId,
      nouveauId,
      portee,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialogue titre={t.remplacement.titre} onFermer={onFermer}>
      <form className="flex flex-col gap-4" onSubmit={(e) => void confirmer(e)}>
        <p className="text-sm text-muted">{t.remplacement.aide}</p>
        <p className="text-sm font-semibold">{seance.libelle}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.ancien}>{t.remplacement.ancien}</Label>
          <select
            id={ids.ancien}
            className={SELECT}
            required
            value={ancienId}
            onChange={(e) => {
              setAncienId(e.target.value);
            }}
          >
            {seance.intervenantIds.map((id) => (
              <option key={id} value={id}>
                {noms.intervenant(id) ?? t.conflits.unIntervenant}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.nouveau}>{t.remplacement.nouveau}</Label>
          <select
            id={ids.nouveau}
            className={SELECT}
            required
            value={nouveauId}
            onChange={(e) => {
              setNouveauId(e.target.value);
            }}
          >
            <option value="">{t.remplacement.choisir}</option>
            {candidats.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nom}
              </option>
            ))}
          </select>
        </div>
        {seance.serieId ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.portee}>{t.formulaire.portee}</Label>
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
                  {t.formulaire.portees[p]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <MessageErreur erreurs={erreurs} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            {t.remplacement.retour}
          </Button>
          <Button type="submit" disabled={envoi || !nouveauId}>
            {t.remplacement.confirmer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}
