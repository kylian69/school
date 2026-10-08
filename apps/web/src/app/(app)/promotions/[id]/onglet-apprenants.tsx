'use client';

import {
  STATUTS_APPRENANT,
  type DetailPromotion,
  type Inscription,
  type PersonneResume,
  type Promotion,
  type ResultatPassage,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';
import { RecherchePersonne } from '@/components/recherche-personne';

const t = fr.scolarite;
const ta = t.apprenants;
const TONS = {
  preinscrit: 'warn',
  inscrit: 'ok',
  demissionnaire: 'bad',
  exclu: 'bad',
  diplome: 'accent',
} as const;

type Dialogue =
  | { type: 'inscrire' }
  | { type: 'statut'; inscription: Inscription }
  | { type: 'sortie'; inscription: Inscription }
  | { type: 'passage' };

/** Onglet « Apprenants » : inscriptions, statuts, sorties, passage en année supérieure. */
export function OngletApprenants({
  promotion,
  suivantes,
}: {
  promotion: DetailPromotion;
  suivantes: readonly Promotion[];
}) {
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fermer = () => {
    setDialogue(null);
  };
  const nom = (i: Inscription) => `${i.personne.prenom} ${i.personne.nom}`;
  const libelleGroupe = (id: string) => promotion.groupes.find((g) => g.id === id)?.libelle ?? '';
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {promotion.modifiable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setDialogue({ type: 'inscrire' });
            }}
          >
            {ta.inscrire}
          </Button>
          {suivantes.length > 0 ? (
            <Button
              variant="secondary"
              disabled={selection.length === 0}
              onClick={() => {
                setDialogue({ type: 'passage' });
              }}
            >
              {`${ta.passage} (${ta.selection(selection.length)})`}
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-ok">
          {message}
        </p>
      ) : null}
      {promotion.inscriptions.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{ta.vide}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.vues.apprenants}</caption>
            <thead className="text-left text-muted">
              <tr>
                {promotion.modifiable && suivantes.length > 0 ? (
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">{ta.selection(0)}</span>
                  </th>
                ) : null}
                <th scope="col" className="px-3 py-2 font-medium">
                  {ta.nom}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {ta.statut}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {ta.etat}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {ta.groupes}
                </th>
                {promotion.modifiable ? (
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{ta.actions('')}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {promotion.inscriptions.map((i) => {
                const groupes = i.groupes.filter(
                  (g) => g.debut <= aujourdhui && (g.fin === null || aujourdhui < g.fin),
                );
                return (
                  <tr key={i.id} className="border-t border-line">
                    {promotion.modifiable && suivantes.length > 0 ? (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={ta.selectionner(nom(i))}
                          checked={selection.includes(i.id)}
                          onChange={(e) => {
                            setSelection((s) =>
                              e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id),
                            );
                          }}
                          className="size-4"
                        />
                      </td>
                    ) : null}
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="font-medium">{nom(i)}</span>
                      {i.personne.matricule ? (
                        <span className="ml-2 font-mono text-xs text-muted">
                          {i.personne.matricule}
                        </span>
                      ) : null}
                      {i.option ? (
                        <span className="ml-2 text-xs text-muted">
                          {fr.maFormation.option(i.option)}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2">
                      {i.statut ? t.statuts[i.statut] : '—'}
                      {i.statuts.length > 1 ? (
                        <span className="block text-xs text-muted">
                          {ta.depuis(formatDate(i.statuts.at(-1)?.debut))}
                        </span>
                      ) : null}
                      {i.statut === 'apprenti_sans_employeur' && i.statuts.at(-1)?.echeance ? (
                        <span className="block text-xs text-muted">
                          {ta.echeance(formatDate(i.statuts.at(-1)?.echeance))}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={TONS[i.etat]}>{t.etats[i.etat]}</Badge>
                      {i.dateSortie ? (
                        <span className="block text-xs text-muted">
                          {ta.sortiLe(formatDate(i.dateSortie))}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {groupes.map((g) => libelleGroupe(g.groupeId)).join(', ') || '—'}
                    </td>
                    {promotion.modifiable ? (
                      <td className="px-3 py-2">
                        <div
                          className="flex flex-wrap gap-1"
                          role="group"
                          aria-label={ta.actions(nom(i))}
                        >
                          <Button
                            variant="ghost"
                            aria-label={`${ta.changerStatut} · ${nom(i)}`}
                            onClick={() => {
                              setDialogue({ type: 'statut', inscription: i });
                            }}
                          >
                            {ta.changerStatut}
                          </Button>
                          {i.etat === 'inscrit' || i.etat === 'preinscrit' ? (
                            <Button
                              variant="ghost"
                              aria-label={`${ta.sortie} · ${nom(i)}`}
                              onClick={() => {
                                setDialogue({ type: 'sortie', inscription: i });
                              }}
                            >
                              {ta.sortie}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {dialogue?.type === 'inscrire' ? <Inscrire promotion={promotion} onFermer={fermer} /> : null}
      {dialogue?.type === 'statut' ? (
        <Statut inscription={dialogue.inscription} onFermer={fermer} />
      ) : null}
      {dialogue?.type === 'sortie' ? (
        <Sortie inscription={dialogue.inscription} onFermer={fermer} />
      ) : null}
      {dialogue?.type === 'passage' ? (
        <Passage
          promotion={promotion}
          suivantes={suivantes}
          inscriptionIds={selection}
          onFermer={(resultat) => {
            fermer();
            if (resultat) {
              setSelection([]);
              setMessage(ta.passes(resultat.inscrites, resultat.dejaInscrites));
            }
          }}
        />
      ) : null}
    </div>
  );
}

function Fenetre({
  titre,
  children,
  onFermer,
}: {
  titre: string;
  children: ReactNode;
  onFermer: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={titre} className="max-h-[85vh] max-w-xl overflow-y-auto">
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Inscrire({ promotion, onFermer }: { promotion: DetailPromotion; onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const [personne, setPersonne] = useState<PersonneResume | null>(null);
  const ids = { statut: useId(), option: useId() };

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!personne) return;
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/promotions/${promotion.id}/inscriptions`, 'POST', {
      personneId: personne.id,
      statut: texte(d.get('statut')),
      option: texte(d.get('option')) || null,
      dateEntree: texte(d.get('dateEntree')) || undefined,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Fenetre titre={ta.inscrire} onFermer={onFermer}>
      <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
        <RecherchePersonne choisie={personne} onChoisir={setPersonne} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.statut}>{ta.statut}</Label>
            <select id={ids.statut} name="statut" className={SELECT}>
              {STATUTS_APPRENANT.map((s) => (
                <option key={s} value={s}>
                  {t.statuts[s]}
                </option>
              ))}
            </select>
          </div>
          <Champ
            nom="dateEntree"
            label={ta.dateEntree}
            erreurs={erreurs}
            type="date"
            defaultValue={promotion.dateDebut}
          />
        </div>
        {promotion.options.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.option}>{ta.option}</Label>
            <select id={ids.option} name="option" className={SELECT}>
              <option value="">{ta.sansOption}</option>
              {promotion.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <MessageErreur erreurs={erreurs} champs={['dateEntree']} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFermer}>
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi || !personne}>
            {t.enregistrer}
          </Button>
        </div>
      </form>
    </Fenetre>
  );
}

function Statut({ inscription, onFermer }: { inscription: Inscription; onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const id = useId();
  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const r = await executer(`/api/inscriptions/${inscription.id}/statut`, 'POST', {
      statut: texte(d.get('statut')),
      debut: texte(d.get('debut')),
    });
    if (r.ok) onFermer();
  }
  return (
    <Fenetre
      titre={`${ta.changerStatut} · ${inscription.personne.prenom} ${inscription.personne.nom}`}
      onFermer={onFermer}
    >
      <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{ta.statut}</Label>
          <select
            id={id}
            name="statut"
            defaultValue={inscription.statut ?? 'initial'}
            className={SELECT}
          >
            {STATUTS_APPRENANT.map((s) => (
              <option key={s} value={s}>
                {t.statuts[s]}
              </option>
            ))}
          </select>
        </div>
        <Champ
          nom="debut"
          label={ta.dateEffet}
          erreurs={erreurs}
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
        <MessageErreur erreurs={erreurs} champs={['debut']} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFermer}>
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.enregistrer}
          </Button>
        </div>
      </form>
    </Fenetre>
  );
}

function Sortie({ inscription, onFermer }: { inscription: Inscription; onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const id = useId();
  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const r = await executer(`/api/inscriptions/${inscription.id}`, 'PATCH', {
      etat: texte(d.get('etat')),
      dateSortie: texte(d.get('dateSortie')) || null,
      motifSortie: texte(d.get('motifSortie')) || null,
    });
    if (r.ok) onFermer();
  }
  return (
    <Fenetre
      titre={`${ta.sortie} · ${inscription.personne.prenom} ${inscription.personne.nom}`}
      onFermer={onFermer}
    >
      <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{ta.nouvelEtat}</Label>
          <select id={id} name="etat" className={SELECT}>
            {(['demissionnaire', 'exclu', 'diplome'] as const).map((e) => (
              <option key={e} value={e}>
                {t.etats[e]}
              </option>
            ))}
          </select>
        </div>
        <Champ nom="dateSortie" label={ta.dateSortie} erreurs={erreurs} type="date" required />
        <Champ nom="motifSortie" label={ta.motif} erreurs={erreurs} maxLength={300} />
        <MessageErreur erreurs={erreurs} champs={['dateSortie', 'motifSortie']} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFermer}>
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.enregistrer}
          </Button>
        </div>
      </form>
    </Fenetre>
  );
}

function Passage({
  promotion,
  suivantes,
  inscriptionIds,
  onFermer,
}: {
  promotion: DetailPromotion;
  suivantes: readonly Promotion[];
  inscriptionIds: readonly string[];
  onFermer: (resultat: ResultatPassage | null) => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const id = useId();
  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const r = await executer(`/api/promotions/${promotion.id}/passage`, 'POST', {
      promotionCibleId: texte(d.get('cible')),
      inscriptionIds,
    });
    if (r.ok) onFermer(r.body as ResultatPassage);
  }
  return (
    <Fenetre
      titre={ta.passage}
      onFermer={() => {
        onFermer(null);
      }}
    >
      <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
        <p className="text-sm text-muted">{ta.aidePassage}</p>
        <p className="text-sm">{ta.selection(inscriptionIds.length)}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{ta.cible}</Label>
          <select id={id} name="cible" className={SELECT}>
            {suivantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>
        <MessageErreur erreurs={erreurs} />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onFermer(null);
            }}
          >
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.confirmer}
          </Button>
        </div>
      </form>
    </Fenetre>
  );
}
