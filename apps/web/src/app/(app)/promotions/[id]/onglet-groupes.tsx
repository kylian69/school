'use client';

import {
  TYPES_GROUPE,
  type DetailPromotion,
  type Groupe,
  type ResultatRepartition,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { nombre, SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.scolarite;
const tg = t.groupes;

const jourDe = (date: string, g: { debut: string; fin: string | null }) =>
  g.debut <= date && (g.fin === null || date < g.fin);

/**
 * Onglet « Groupes » (US-02-07, RG-02-14 à RG-02-16) : groupes de la promotion, répartition
 * automatique avec aperçu, et changement de groupe à une date d'effet (section 7). Le choix dans
 * une liste remplace le glisser-déposer des maquettes (accessible au clavier).
 */
export function OngletGroupes({ promotion }: { promotion: DetailPromotion }) {
  const { erreurs, executer } = useEnvoi();
  const [dialogue, setDialogue] = useState<'nouveau' | 'repartition' | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [forcer, setForcer] = useState(false);
  const idDate = useId();
  const types = TYPES_GROUPE.filter((type) => promotion.groupes.some((g) => g.type === type));
  const actifs = promotion.inscriptions.filter(
    (i) =>
      (i.etat === 'inscrit' || i.etat === 'preinscrit') &&
      (i.dateSortie === null || date < i.dateSortie),
  );

  async function changer(inscriptionId: string, actuel: Groupe | undefined, cible: string) {
    if (cible === '') {
      if (actuel)
        await executer(`/api/groupes/${actuel.id}/retrait`, 'POST', { inscriptionId, date });
      return;
    }
    await executer(`/api/groupes/${cible}/membres`, 'POST', {
      inscriptionIds: [inscriptionId],
      date,
      forcer,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {promotion.modifiable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setDialogue('nouveau');
            }}
          >
            {tg.nouveau}
          </Button>
          {promotion.groupes.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setDialogue('repartition');
              }}
            >
              {tg.repartir}
            </Button>
          ) : null}
        </div>
      ) : null}
      {promotion.groupes.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{tg.vide}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {promotion.groupes.map((g) => (
            <li key={g.id}>
              <Card className="flex flex-col gap-2 py-3">
                <p className="font-medium">{g.libelle}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">{t.typesGroupe[g.type]}</Badge>
                  <Badge
                    tone={g.capacite !== null && g.effectif >= g.capacite ? 'warn' : 'neutral'}
                  >
                    {tg.effectif(g.effectif, g.capacite)}
                  </Badge>
                  {g.promotionIds.length > 1 ? <Badge>{tg.transversalCourt}</Badge> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {types.length > 0 ? (
        <section aria-labelledby="titre-membres" className="flex flex-col gap-3">
          <h2 id="titre-membres" className="text-lg font-semibold">
            {tg.membres}
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idDate}>{tg.date}</Label>
              <Input
                id={idDate}
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
              />
            </div>
            {promotion.modifiable ? (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forcer}
                  onChange={(e) => {
                    setForcer(e.target.checked);
                  }}
                  className="size-4"
                />
                {tg.forcer}
              </label>
            ) : null}
          </div>
          <MessageErreur erreurs={erreurs} />
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">{tg.membres}</caption>
              <thead className="text-left text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t.apprenants.nom}
                  </th>
                  {types.map((type) => (
                    <th key={type} scope="col" className="px-3 py-2 font-medium">
                      {tg.groupeDe(t.typesGroupe[type])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actifs.map((i) => {
                  const nom = `${i.personne.prenom} ${i.personne.nom}`;
                  return (
                    <tr key={i.id} className="border-t border-line">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {nom}
                      </th>
                      {types.map((type) => {
                        const duType = promotion.groupes.filter((g) => g.type === type);
                        const actuel = duType.find((g) =>
                          i.groupes.some((m) => m.groupeId === g.id && jourDe(date, m)),
                        );
                        return (
                          <td key={type} className="px-3 py-2">
                            {promotion.modifiable ? (
                              <select
                                aria-label={tg.deplacer(nom, t.typesGroupe[type])}
                                value={actuel?.id ?? ''}
                                onChange={(e) => void changer(i.id, actuel, e.target.value)}
                                className={SELECT}
                              >
                                <option value="">{tg.sansGroupe}</option>
                                {duType.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.libelle}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              (actuel?.libelle ?? '—')
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}

      {dialogue === 'nouveau' ? (
        <NouveauGroupe
          promotion={promotion}
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : null}
      {dialogue === 'repartition' ? (
        <Repartition
          promotion={promotion}
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : null}
    </div>
  );
}

function NouveauGroupe({
  promotion,
  onFermer,
}: {
  promotion: DetailPromotion;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { type: useId(), option: useId() };
  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const r = await executer(`/api/promotions/${promotion.id}/groupes`, 'POST', {
      libelle: texte(d.get('libelle')),
      type: texte(d.get('type')),
      capacite: nombre(d.get('capacite')) ?? null,
      option: texte(d.get('option')) || null,
    });
    if (r.ok) onFermer();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={tg.nouveau}>
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <Champ nom="libelle" label={t.champs.libelle} erreurs={erreurs} required maxLength={80} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.type}>{tg.type}</Label>
              <select id={ids.type} name="type" className={SELECT}>
                {TYPES_GROUPE.map((type) => (
                  <option key={type} value={type}>
                    {t.typesGroupe[type]}
                  </option>
                ))}
              </select>
            </div>
            <Champ nom="capacite" label={tg.capacite} erreurs={erreurs} type="number" min={1} />
          </div>
          {promotion.options.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.option}>{tg.option}</Label>
              <select id={ids.option} name="option" className={SELECT}>
                <option value="">{t.apprenants.sansOption}</option>
                {promotion.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <MessageErreur erreurs={erreurs} champs={['libelle', 'capacite']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Repartition({
  promotion,
  onFermer,
}: {
  promotion: DetailPromotion;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { type: useId(), methode: useId(), critere: useId() };
  const types = TYPES_GROUPE.filter((type) => promotion.groupes.some((g) => g.type === type));
  const [type, setType] = useState(types[0] ?? 'td');
  const [methode, setMethode] = useState<'alphabetique' | 'equilibre' | 'critere'>('alphabetique');
  const [proposition, setProposition] = useState<ResultatRepartition | null>(null);
  const groupes = promotion.groupes.filter((g) => g.type === type);

  async function envoyerRepartition(form: HTMLFormElement, apercu: boolean) {
    const d = new FormData(form);
    const r = await executer(`/api/promotions/${promotion.id}/repartition`, 'POST', {
      groupeIds: d.getAll('groupeIds'),
      methode,
      ...(methode === 'critere' ? { critere: texte(d.get('critere')) } : {}),
      date: texte(d.get('date')) || undefined,
      apercu,
    });
    if (!r.ok) return;
    if (apercu) setProposition(r.body as ResultatRepartition);
    else onFermer();
  }
  const libelle = (id: string) => promotion.groupes.find((g) => g.id === id)?.libelle ?? '';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={tg.repartir} className="max-h-[85vh] max-w-xl overflow-y-auto">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void envoyerRepartition(event.currentTarget, true);
          }}
          onChange={() => {
            setProposition(null);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.type}>{tg.type}</Label>
              <select
                id={ids.type}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                }}
                className={SELECT}
              >
                {types.map((x) => (
                  <option key={x} value={x}>
                    {t.typesGroupe[x]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.methode}>{tg.methode}</Label>
              <select
                id={ids.methode}
                value={methode}
                onChange={(e) => {
                  setMethode(e.target.value as typeof methode);
                }}
                className={SELECT}
              >
                {(['alphabetique', 'equilibre', 'critere'] as const).map((m) => (
                  <option key={m} value={m}>
                    {tg.methodes[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {methode === 'critere' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.critere}>{tg.critere}</Label>
              <select id={ids.critere} name="critere" className={SELECT}>
                <option value="statut">{tg.criteres.statut}</option>
                <option value="option">{tg.criteres.option}</option>
              </select>
            </div>
          ) : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{tg.groupesARemplir}</legend>
            {groupes.map((g) => (
              <label key={g.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <input
                  type="checkbox"
                  name="groupeIds"
                  value={g.id}
                  defaultChecked
                  className="size-4"
                />
                {`${g.libelle} · ${tg.effectif(g.effectif, g.capacite)}`}
              </label>
            ))}
          </fieldset>
          <Champ
            nom="date"
            label={tg.date}
            erreurs={erreurs}
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <MessageErreur erreurs={erreurs} champs={['date']} />
          {proposition ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              <p>
                {proposition.affectations.length === 0 && proposition.nonAffectes.length === 0
                  ? tg.aucunARepartir
                  : tg.proposition(proposition.affectations.length, proposition.nonAffectes.length)}
              </p>
              <ul className="list-disc pl-5">
                {groupes.map((g) => (
                  <li
                    key={g.id}
                  >{`${libelle(g.id)} : +${String(proposition.affectations.filter((a) => a.groupeId === g.id).length)}`}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            {proposition && proposition.affectations.length > 0 ? (
              <Button
                disabled={envoi}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) void envoyerRepartition(form, false);
                }}
              >
                {tg.appliquer}
              </Button>
            ) : (
              <Button type="submit" disabled={envoi}>
                {tg.apercu}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
