'use client';

import {
  TYPES_JOUR,
  type CalendrierPromotion,
  type DetailPromotion,
  type ListeModelesRythme,
} from '@scolaly/contracts';
import { Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { SELECT, texte, useEnvoi } from '../../formations/envoi';

const t = fr.rythmes;
type TypeJour = (typeof TYPES_JOUR)[number];

/** Couleurs du calendrier annuel (école, entreprise, fermé, examen). */
const COULEURS: Record<TypeJour, string> = {
  ecole: 'bg-accent-soft text-accent',
  entreprise: 'bg-ok-soft text-ok',
  ferme: 'bg-surface-2 text-muted',
  examen: 'bg-warn-soft text-warn',
};

const JOUR_MS = 86_400_000;
const versDate = (jour: string) => new Date(`${jour}T00:00:00Z`);
const libelleJour = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const libelleMois = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/** Mois de la période, chacun avec ses jours et le décalage du premier (lundi = 0). */
function mois(debut: string, fin: string) {
  const liste: { cle: string; titre: string; decalage: number; jours: string[] }[] = [];
  for (let n = versDate(debut).getTime(); n <= versDate(fin).getTime(); n += JOUR_MS) {
    const date = new Date(n);
    const jour = date.toISOString().slice(0, 10);
    const cle = jour.slice(0, 7);
    let courant = liste.at(-1);
    if (courant?.cle !== cle) {
      courant = {
        cle,
        titre: libelleMois.format(date),
        decalage: (date.getUTCDay() + 6) % 7,
        jours: [],
      };
      liste.push(courant);
    }
    courant.jours.push(jour);
  }
  return liste;
}

/** E-03-05 · Rythme d'alternance d'une promotion (RG-03-10 à RG-03-12). */
export function OngletRythme({
  promotion,
  rythme,
  modeles,
}: {
  promotion: DetailPromotion;
  rythme: CalendrierPromotion;
  modeles: ListeModelesRythme;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { modele: useId(), pinceau: useId() };
  const [pinceau, setPinceau] = useState<TypeJour>('examen');
  const [retouches, setRetouches] = useState<Record<string, TypeJour>>({});
  const [dialogue, setDialogue] = useState<'exception' | 'modele' | null>(null);
  const { calendrier } = rythme;
  const nbRetouches = Object.keys(retouches).length;

  async function generer(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (calendrier && !window.confirm(t.confirmerGeneration)) return;
    const modele = texte(new FormData(event.currentTarget).get('modele'));
    const resultat = await executer(`/api/promotions/${promotion.id}/rythme`, 'PUT', { modele });
    if (resultat.ok) setRetouches({});
  }

  async function enregistrerRetouches() {
    const resultat = await executer(`/api/promotions/${promotion.id}/rythme/jours`, 'PATCH', {
      jours: Object.entries(retouches).map(([date, type]) => ({ date, type })),
    });
    if (resultat.ok) setRetouches({});
  }

  async function supprimerException(id: string) {
    if (!window.confirm(t.confirmerSuppression)) return;
    await executer(`/api/exceptions-rythme/${id}`, 'DELETE');
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        {calendrier ? (
          <p className="text-sm text-muted">{t.modeleOrigine(calendrier.modele)}</p>
        ) : (
          <p className="text-sm text-muted">{t.aucun}</p>
        )}
        {rythme.modifiable ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void generer(e)}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
              <Label htmlFor={ids.modele}>{t.modele}</Label>
              <select id={ids.modele} name="modele" className={SELECT}>
                {modeles.modeles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.libelle}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={envoi}>
              {t.generer}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDialogue('modele');
              }}
            >
              {t.nouveauModele}
            </Button>
          </form>
        ) : null}
        <MessageErreur erreurs={erreurs} />
      </Card>

      {calendrier ? (
        <Card className="flex flex-col gap-4">
          <ul aria-label={t.legende} className="flex flex-wrap gap-2 text-sm">
            {TYPES_JOUR.map((type) => (
              <li key={type} className={`rounded-md px-2 py-1 ${COULEURS[type]}`}>
                {t.compte(t.types[type], calendrier.compte[type])}
              </li>
            ))}
          </ul>
          {rythme.modifiable ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={ids.pinceau}>{t.pinceau}</Label>
                <select
                  id={ids.pinceau}
                  value={pinceau}
                  onChange={(e) => {
                    setPinceau(e.target.value as TypeJour);
                  }}
                  className={SELECT}
                >
                  {TYPES_JOUR.map((type) => (
                    <option key={type} value={type}>
                      {t.types[type]}
                    </option>
                  ))}
                </select>
              </div>
              {nbRetouches > 0 ? (
                <>
                  <Button disabled={envoi} onClick={() => void enregistrerRetouches()}>
                    {t.retouches(nbRetouches)}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRetouches({});
                    }}
                  >
                    {t.abandonner}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted">{t.aideRetouche}</p>
              )}
            </div>
          ) : null}
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {mois(promotion.dateDebut, promotion.dateFin).map((m) => (
              <section key={m.cle} aria-label={m.titre} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold capitalize">{m.titre}</h3>
                <div className="grid grid-cols-7 gap-1 text-center text-xs" aria-hidden="true">
                  {t.initialesSemaine.map((j, i) => (
                    <span key={i} className="text-muted">
                      {j}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {m.decalage > 0 ? (
                    <span style={{ gridColumn: `span ${String(m.decalage)}` }} />
                  ) : null}
                  {m.jours.map((jour) => {
                    const type = retouches[jour] ?? calendrier.jours[jour] ?? 'ferme';
                    const libelle = t.jour(libelleJour.format(versDate(jour)), t.types[type]);
                    const classe = `flex min-h-11 items-center justify-center rounded-md text-xs tabular-nums md:min-h-8 ${COULEURS[type]} ${retouches[jour] ? 'ring-2 ring-fg' : ''}`;
                    return rythme.modifiable ? (
                      <button
                        key={jour}
                        type="button"
                        aria-label={libelle}
                        aria-pressed={retouches[jour] !== undefined}
                        className={classe}
                        onClick={() => {
                          setRetouches((avant) =>
                            avant[jour]
                              ? Object.fromEntries(
                                  Object.entries(avant).filter(([cle]) => cle !== jour),
                                )
                              : { ...avant, [jour]: pinceau },
                          );
                        }}
                      >
                        {Number(jour.slice(8))}
                      </button>
                    ) : (
                      <span key={jour} role="img" aria-label={libelle} className={classe}>
                        {Number(jour.slice(8))}
                      </span>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t.exceptions}</h2>
          {rythme.modifiable && calendrier ? (
            <Button
              variant="secondary"
              onClick={() => {
                setDialogue('exception');
              }}
            >
              {t.nouvelleException}
            </Button>
          ) : null}
        </div>
        {rythme.exceptions.length === 0 ? (
          <p className="text-sm text-muted">{t.aucuneException}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rythme.exceptions.map((e) => {
              const nom = `${e.apprenant.prenom} ${e.apprenant.nom}`;
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {t.exception(nom, formatDate(e.debut), formatDate(e.fin))}
                    </span>
                    {e.motif ? <span className="text-sm text-muted">{e.motif}</span> : null}
                  </div>
                  {rythme.modifiable ? (
                    <Button
                      variant="ghost"
                      disabled={envoi}
                      onClick={() => void supprimerException(e.id)}
                    >
                      {t.supprimerException(nom)}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {dialogue === 'exception' ? (
        <NouvelleException
          promotion={promotion}
          modeles={modeles}
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : null}
      {dialogue === 'modele' ? (
        <NouveauModele
          onFermer={() => {
            setDialogue(null);
          }}
        />
      ) : null}
    </div>
  );
}

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
      <DialogContent title={titre} className="max-h-[85vh] max-w-xl overflow-y-auto">
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** RG-03-12 : exception d'un apprenant sur une période, d'après un modèle. */
function NouvelleException({
  promotion,
  modeles,
  onFermer,
}: {
  promotion: DetailPromotion;
  modeles: ListeModelesRythme;
  onFermer: () => void;
}) {
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = { apprenant: useId(), modele: useId() };
  const inscrits = promotion.inscriptions.filter(
    (i) => i.etat === 'inscrit' || i.etat === 'preinscrit',
  );

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const resultat = await executer(`/api/promotions/${promotion.id}/rythme/exceptions`, 'POST', {
      inscriptionId: texte(d.get('inscriptionId')),
      debut: texte(d.get('debut')),
      fin: texte(d.get('fin')),
      modele: texte(d.get('modele')),
      motif: texte(d.get('motif')) || null,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialogue titre={t.nouvelleException} onFermer={onFermer}>
      <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.apprenant}>{t.champs.apprenant}</Label>
          <select id={ids.apprenant} name="inscriptionId" className={SELECT}>
            {inscrits.map((i) => (
              <option key={i.id} value={i.id}>
                {`${i.personne.prenom} ${i.personne.nom}`}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="debut"
            label={t.champs.debut}
            erreurs={erreurs}
            type="date"
            required
            min={promotion.dateDebut}
            max={promotion.dateFin}
          />
          <Champ
            nom="fin"
            label={t.champs.fin}
            erreurs={erreurs}
            type="date"
            required
            min={promotion.dateDebut}
            max={promotion.dateFin}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.modele}>{t.modele}</Label>
          <select id={ids.modele} name="modele" className={SELECT}>
            {modeles.modeles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.libelle}
              </option>
            ))}
          </select>
        </div>
        <Champ
          nom="motif"
          label={t.champs.motif}
          aide={t.champs.motifAide}
          erreurs={erreurs}
          maxLength={300}
        />
        <MessageErreur erreurs={erreurs} champs={['debut', 'fin', 'motif']} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFermer}>
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.enregistrer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}

/** RG-03-10 : modèle de l'école, de 1 à 4 semaines. */
function NouveauModele({ onFermer }: { onFermer: () => void }) {
  const { erreurs, envoi, executer } = useEnvoi();
  const idSemaines = useId();
  const [semaines, setSemaines] = useState(1);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const motif = Array.from({ length: semaines }, (_, s) =>
      Array.from({ length: 7 }, (_, j) => texte(d.get(`jour-${String(s)}-${String(j)}`))),
    );
    const resultat = await executer('/api/rythmes/modeles', 'POST', {
      libelle: texte(d.get('libelle')),
      motif,
    });
    if (resultat.ok) onFermer();
  }

  return (
    <Dialogue titre={t.nouveauModele} onFermer={onFermer}>
      <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
        <Champ nom="libelle" label={t.champs.libelle} erreurs={erreurs} required maxLength={120} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idSemaines}>{t.champs.semaines}</Label>
          <select
            id={idSemaines}
            value={semaines}
            onChange={(e) => {
              setSemaines(Number(e.target.value));
            }}
            className={SELECT}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {Array.from({ length: semaines }, (_, s) => (
          <fieldset key={s} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.champs.semaine(s + 1)}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {t.joursSemaine.map((jour, j) => (
                <label key={jour} className="flex flex-col gap-1 text-xs">
                  <span>{jour}</span>
                  <select
                    name={`jour-${String(s)}-${String(j)}`}
                    aria-label={t.champs.jourSemaine(jour, s + 1)}
                    defaultValue={j >= 5 ? 'ferme' : j < 2 ? 'ecole' : 'entreprise'}
                    className={SELECT}
                  >
                    {TYPES_JOUR.map((type) => (
                      <option key={type} value={type}>
                        {t.types[type]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <MessageErreur erreurs={erreurs} champs={['libelle']} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFermer}>
            {t.annuler}
          </Button>
          <Button type="submit" disabled={envoi}>
            {t.enregistrer}
          </Button>
        </div>
      </form>
    </Dialogue>
  );
}
