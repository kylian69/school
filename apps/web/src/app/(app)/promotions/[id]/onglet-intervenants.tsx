'use client';

import type { AffectationsPromotion, DetailPromotion, PersonneResume } from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { chiffre, nombre, useEnvoi } from '../../formations/envoi';
import { RecherchePersonne } from '@/components/recherche-personne';

const t = fr.scolarite;
const ti = t.intervenants;
const TYPES = ['cm', 'td', 'tp', 'projet', 'elearning'] as const;
const typeH = fr.referentiel.maquette.typesHeures;

const total = (h: Record<(typeof TYPES)[number], number>) => TYPES.reduce((s, x) => s + h[x], 0);

/** Onglet « Intervenants » (US-02-08, RG-02-18) : affectations par module et écarts d'heures. */
export function OngletIntervenants({
  promotion,
  affectations,
}: {
  promotion: DetailPromotion;
  affectations: AffectationsPromotion;
}) {
  const { erreurs, executer } = useEnvoi();
  const [ajout, setAjout] = useState<string | null>(null);
  const libelleGroupe = (id: string) => promotion.groupes.find((g) => g.id === id)?.libelle ?? '';

  return (
    <div className="flex flex-col gap-4">
      <MessageErreur erreurs={erreurs} />
      {affectations.modules.map((m) => {
        const siennes = affectations.affectations.filter((a) => a.moduleId === m.id);
        return (
          <Card key={m.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold">
                  <span className="font-mono">{m.code}</span> · {m.intitule}
                  <span className="font-normal text-muted"> · {m.ueCode}</span>
                </h2>
                <p className="text-sm text-muted">
                  {`${ti.prevu} ${chiffre(total(m.prevu))} h · ${ti.affecte} ${chiffre(total(m.affecte))} h`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {m.ecarts.length === 0 ? (
                    <Badge tone="ok">{ti.aucunEcart}</Badge>
                  ) : (
                    m.ecarts.map((e) => (
                      <Badge key={e.type} tone="warn">
                        {`${typeH[e.type]} : ${ti.ecart(`${e.ecart > 0 ? '+' : ''}${chiffre(e.ecart)}`)}`}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              {affectations.modifiable ? (
                <Button
                  variant="secondary"
                  aria-label={`${ti.affecter} · ${m.code}`}
                  onClick={() => {
                    setAjout(m.id);
                  }}
                >
                  {ti.affecter}
                </Button>
              ) : null}
            </div>
            {siennes.length === 0 ? (
              <p className="text-sm text-muted">{ti.aucune}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {siennes.map((a) => {
                  const nom = `${a.intervenant.prenom} ${a.intervenant.nom}`;
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">{nom}</span>
                        <span className="text-muted">
                          {` · ${a.groupeIds.map(libelleGroupe).join(', ') || ti.touteLaPromotion} · `}
                          {TYPES.filter((x) => a.heures[x] > 0)
                            .map((x) => `${typeH[x]} ${chiffre(a.heures[x])} h`)
                            .join(', ')}
                        </span>
                      </span>
                      {affectations.modifiable ? (
                        <Button
                          variant="ghost"
                          aria-label={ti.retirer(nom, m.code)}
                          onClick={() => void executer(`/api/affectations/${a.id}`, 'DELETE')}
                        >
                          {fr.referentiel.supprimer}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
      {ajout ? (
        <Affecter
          promotion={promotion}
          module={affectations.modules.find((m) => m.id === ajout)}
          onFermer={() => {
            setAjout(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Affecter({
  promotion,
  module,
  onFermer,
}: {
  promotion: DetailPromotion;
  module: AffectationsPromotion['modules'][number] | undefined;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const [intervenant, setIntervenant] = useState<PersonneResume | null>(null);
  const idGroupes = useId();
  if (!module) return null;
  const restant = (x: (typeof TYPES)[number]) => Math.max(0, module.prevu[x] - module.affecte[x]);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!intervenant || !module) return;
    const d = new FormData(event.currentTarget);
    const r = await executer(`/api/promotions/${promotion.id}/affectations`, 'POST', {
      personneId: intervenant.id,
      moduleId: module.id,
      groupeIds: d.getAll('groupeIds'),
      heures: Object.fromEntries(TYPES.map((x) => [x, nombre(d.get(x)) ?? 0])),
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
      <DialogContent
        title={`${ti.affecter} · ${module.code}`}
        className="max-h-[85vh] max-w-xl overflow-y-auto"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <RecherchePersonne choisie={intervenant} onChoisir={setIntervenant} />
          {promotion.groupes.length > 0 ? (
            <fieldset className="flex flex-col gap-2" aria-describedby={idGroupes}>
              <legend className="mb-1 text-sm font-medium">{ti.groupes}</legend>
              <p id={idGroupes} className="text-xs text-muted">
                {ti.touteLaPromotion}
              </p>
              {promotion.groupes.map((g) => (
                <label key={g.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                  <input type="checkbox" name="groupeIds" value={g.id} className="size-4" />
                  {g.libelle}
                </label>
              ))}
            </fieldset>
          ) : null}
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <legend className="mb-2 text-sm font-medium">{fr.referentiel.maquette.heures}</legend>
            {TYPES.map((x) => (
              <Champ
                key={x}
                nom={x}
                label={typeH[x]}
                erreurs={erreurs}
                type="number"
                min={0}
                step="0.25"
                defaultValue={restant(x)}
              />
            ))}
          </fieldset>
          <MessageErreur erreurs={erreurs} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit" disabled={envoi || !intervenant}>
              {t.enregistrer}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
