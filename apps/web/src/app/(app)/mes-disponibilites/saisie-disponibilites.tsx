'use client';

import type { CreneauDisponibilite, MesDisponibilites } from '@scolaly/contracts';
import { MOTIF_INDISPONIBILITE_MAX } from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';

type Soumission = SyntheticEvent<HTMLFormElement, SubmitEvent>;
import { SELECT } from '../formations/envoi';
import {
  Champ,
  MessageErreur,
  SANS_ERREUR,
  valeursDuFormulaire,
  type Erreurs,
} from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate, formatDateHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.disponibilites;
const URL_API = '/api/moi/disponibilites';

type Cible = 'creneau' | 'indispo';

/**
 * E-04-07 : créneaux récurrents par jour (ajout d'une demi-journée en un geste, ou d'un créneau
 * libre avec sa période de validité) et indisponibilités ponctuelles avec motif facultatif.
 */
export function SaisieDisponibilites({ initial }: { initial: MesDisponibilites }) {
  const [donnees, setDonnees] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [erreurs, setErreurs] = useState<Record<Cible, Erreurs>>({
    creneau: SANS_ERREUR,
    indispo: SANS_ERREUR,
  });
  const [message, setMessage] = useState<Record<Cible, string | null>>({
    creneau: null,
    indispo: null,
  });
  const idJour = useId();
  const { plage, fuseau } = donnees;

  async function agir(
    cible: Cible,
    url: string,
    method: 'POST' | 'DELETE',
    succes: string,
    corps?: unknown,
  ): Promise<boolean> {
    setEnvoi(true);
    setMessage((m) => ({ ...m, [cible]: null }));
    const resultat = await envoyer(`${URL_API}${url}`, method, corps);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreurs((e) => ({
        ...e,
        [cible]: { message: resultat.erreur, details: resultat.details },
      }));
      return false;
    }
    setErreurs((e) => ({ ...e, [cible]: SANS_ERREUR }));
    setDonnees(resultat.body as MesDisponibilites);
    setMessage((m) => ({ ...m, [cible]: succes }));
    return true;
  }

  async function ajouterCreneau(event: Soumission) {
    event.preventDefault();
    const form = event.currentTarget;
    const v = valeursDuFormulaire(form);
    const ok = await agir('creneau', '/creneaux', 'POST', t.creneauAjoute, {
      jourSemaine: Number(v.jourSemaine),
      heureDebut: v.heureDebut,
      heureFin: v.heureFin,
      valableDu: v.valableDu || null,
      valableAu: v.valableAu || null,
    });
    if (ok) form.reset();
  }

  async function ajouterIndispo(event: Soumission) {
    event.preventDefault();
    const form = event.currentTarget;
    const v = valeursDuFormulaire(form);
    const ok = await agir('indispo', '/indisponibilites', 'POST', t.indispoAjoutee, {
      debut: `${v.debut ?? ''}T${v.debutHeure ?? ''}`,
      fin: `${v.fin ?? ''}T${v.finHeure ?? ''}`,
      motif: v.motif?.trim() ? v.motif.trim() : null,
    });
    if (ok) form.reset();
  }

  // Jours ouvrés, plus tout jour qui porte déjà un créneau (plage modifiée depuis).
  const jours = [
    ...new Set([...plage.joursOuvres, ...donnees.creneaux.map((c) => c.jourSemaine)]),
  ].sort((a, b) => a - b);
  const demiJournees = [
    { libelle: t.matin, aria: t.ajouterMatin, debut: plage.debut, fin: plage.limiteMidi },
    { libelle: t.apresMidi, aria: t.ajouterApresMidi, debut: plage.limiteMidi, fin: plage.fin },
  ];
  const libre = (creneaux: CreneauDisponibilite[], debut: string, fin: string) =>
    !creneaux.some((c) => c.heureDebut < fin && debut < c.heureFin);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-[620]">{t.creneauxTitre}</h2>
        <p className="text-sm text-muted">{t.creneauxAide(plage.debut, plage.fin)}</p>
        <ul className="flex flex-col divide-y divide-line">
          {jours.map((jour) => {
            const nom = t.jours[jour - 1] ?? '';
            const duJour = donnees.creneaux.filter((c) => c.jourSemaine === jour);
            return (
              <li key={jour} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <span className="w-24 shrink-0 font-[560]">{nom}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {duJour.length === 0 ? (
                    <span className="text-sm text-muted">{t.aucunCeJour}</span>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {duJour.map((c) => {
                        const creneau = t.creneau(c.heureDebut, c.heureFin);
                        const validite = t.validite(
                          c.valableDu ? formatDate(c.valableDu) : null,
                          c.valableAu ? formatDate(c.valableAu) : null,
                        );
                        return (
                          <li
                            key={c.id}
                            className="flex items-center gap-2 rounded-control bg-ok-soft py-1 pl-3 pr-1 text-sm"
                          >
                            <span>
                              {creneau}
                              {validite ? <span className="text-muted"> · {validite}</span> : null}
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 px-2"
                              disabled={envoi}
                              aria-label={t.retirerCreneau(nom, creneau)}
                              onClick={() =>
                                void agir('creneau', `/creneaux/${c.id}`, 'DELETE', t.creneauRetire)
                              }
                            >
                              ×
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {plage.joursOuvres.includes(jour) ? (
                    <div className="flex flex-wrap gap-2">
                      {demiJournees
                        .filter((d) => libre(duJour, d.debut, d.fin))
                        .map((d) => (
                          <Button
                            key={d.libelle}
                            type="button"
                            variant="secondary"
                            disabled={envoi}
                            aria-label={d.aria(nom.toLowerCase())}
                            onClick={() =>
                              void agir('creneau', '/creneaux', 'POST', t.creneauAjoute, {
                                jourSemaine: jour,
                                heureDebut: d.debut,
                                heureFin: d.fin,
                              })
                            }
                          >
                            + {d.libelle}
                          </Button>
                        ))}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => void ajouterCreneau(e)}
        >
          <h3 className="font-[600]">{t.autreCreneau}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idJour}>{t.jour}</Label>
              <select id={idJour} name="jourSemaine" className={SELECT} required>
                {plage.joursOuvres.map((j) => (
                  <option key={j} value={j}>
                    {t.jours[j - 1]}
                  </option>
                ))}
              </select>
            </div>
            <Champ
              nom="heureDebut"
              label={t.heureDebut}
              erreurs={erreurs.creneau}
              type="time"
              step={900}
              min={plage.debut}
              max={plage.fin}
              required
            />
            <Champ
              nom="heureFin"
              label={t.heureFin}
              erreurs={erreurs.creneau}
              type="time"
              step={900}
              min={plage.debut}
              max={plage.fin}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Champ nom="valableDu" label={t.valableDu} erreurs={erreurs.creneau} type="date" />
            <Champ
              nom="valableAu"
              label={t.valableAu}
              erreurs={erreurs.creneau}
              type="date"
              aide={t.valableAide}
            />
          </div>
          <MessageErreur
            erreurs={erreurs.creneau}
            champs={['heureDebut', 'heureFin', 'valableDu', 'valableAu']}
          />
          <Button type="submit" className="self-start" disabled={envoi}>
            {envoi ? t.enCours : t.ajouterCreneau}
          </Button>
        </form>
        {message.creneau ? (
          <p role="status" className="text-sm text-ok">
            {message.creneau}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-[620]">{t.indisposTitre}</h2>
        <p className="text-sm text-muted">{t.indisposAide}</p>
        {donnees.indisponibilites.length === 0 ? (
          <p className="text-sm text-muted">{t.aucuneIndispo}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {donnees.indisponibilites.map((i) => {
              const periode = t.periode(
                formatDateHeure(i.debut, fuseau),
                formatDateHeure(i.fin, fuseau),
              );
              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-bad-soft px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    {periode}
                    {i.motif ? <span className="block text-muted">{i.motif}</span> : null}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={envoi}
                    aria-label={t.retirerIndispo(periode)}
                    onClick={() =>
                      void agir('indispo', `/indisponibilites/${i.id}`, 'DELETE', t.indispoRetiree)
                    }
                  >
                    {t.retirer}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => void ajouterIndispo(e)}
        >
          <h3 className="font-[600]">{t.nouvelleIndispo}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ nom="debut" label={t.debutLe} erreurs={erreurs.indispo} type="date" required />
            <Champ
              nom="debutHeure"
              label={t.debutA}
              erreurs={erreurs.indispo}
              type="time"
              defaultValue={plage.debut}
              required
            />
            <Champ nom="fin" label={t.finLe} erreurs={erreurs.indispo} type="date" required />
            <Champ
              nom="finHeure"
              label={t.finA}
              erreurs={erreurs.indispo}
              type="time"
              defaultValue={plage.fin}
              required
            />
          </div>
          <p className="text-xs text-muted">{t.fuseau(fuseau)}</p>
          <Champ
            nom="motif"
            label={t.motif}
            erreurs={erreurs.indispo}
            maxLength={MOTIF_INDISPONIBILITE_MAX}
            aide={t.motifAide}
            autoComplete="off"
          />
          <MessageErreur erreurs={erreurs.indispo} champs={['debut', 'fin', 'motif']} />
          <Button type="submit" className="self-start" disabled={envoi}>
            {envoi ? t.enCours : t.ajouterIndispo}
          </Button>
        </form>
        {message.indispo ? (
          <p role="status" className="text-sm text-ok">
            {message.indispo}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
