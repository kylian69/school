'use client';

import {
  TYPES_FERMETURE,
  type AnneeScolaire,
  type CalendrierAnnee,
  type Etablissement,
  type Fermeture,
  type PropositionDuplication,
} from '@scolaly/contracts';
import { Badge, Button, Card, cn, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { VueAnnuelle } from './vue-annuelle';

const t = fr.calendrier;
const TONS = { preparation: 'neutral', en_cours: 'ok', cloturee: 'accent' } as const;

interface PeriodeSaisie {
  cle: string;
  id?: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
}

type Confirmation =
  | { type: 'cloture' | 'suppression-annee' }
  | { type: 'suppression-fermeture'; fermeture: Fermeture };

export function CalendrierEditeur({
  annees,
  annee,
  etablissements,
  modifiable,
}: {
  annees: readonly AnneeScolaire[];
  annee: CalendrierAnnee | null;
  etablissements: readonly Etablissement[];
  /** Permission « calendrier:gerer » : sinon, consultation seule. */
  modifiable: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState<'nouvelle' | 'annee' | 'duplication' | null>(null);
  const [proposition, setProposition] = useState<PropositionDuplication | null>(null);

  async function dupliquer() {
    if (!annee) return;
    try {
      const reponse = await fetch(`/api/annees/${annee.id}/duplication`);
      if (!reponse.ok) throw new Error(String(reponse.status));
      setProposition((await reponse.json()) as PropositionDuplication);
      setErreur(null);
      setEdition('duplication');
    } catch {
      setErreur(t.erreurDuplication);
    }
  }
  const [fermeture, setFermeture] = useState<Fermeture | 'nouvelle' | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const modifiableAnnee = modifiable && annee !== null && annee.statut !== 'cloturee';

  async function executer(url: string, method: 'PATCH' | 'DELETE', corps?: unknown) {
    const resultat = await envoyer(url, method, corps, t.erreur);
    if (!resultat.ok) {
      setErreur(
        [resultat.erreur, ...resultat.details.map((d) => d.slice(d.indexOf(' : ') + 3))].join(' '),
      );
      return false;
    }
    setErreur(null);
    return true;
  }

  async function confirmer() {
    if (!annee || !confirmation) return;
    let ok: boolean;
    if (confirmation.type === 'suppression-fermeture') {
      ok = await executer(`/api/fermetures/${confirmation.fermeture.id}`, 'DELETE');
    } else if (confirmation.type === 'cloture') {
      ok = await executer(`/api/annees/${annee.id}`, 'PATCH', { statut: 'cloturee' });
    } else {
      ok = await executer(`/api/annees/${annee.id}`, 'DELETE');
    }
    if (!ok) return;
    setConfirmation(null);
    if (confirmation.type === 'suppression-annee') router.push('/parametres/calendrier');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {modifiable ? null : <p className="text-sm text-muted">{t.lectureSeule}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t.annees}>
          <ul className="flex flex-wrap gap-2">
            {annees.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/parametres/calendrier?annee=${a.id}`}
                  aria-current={a.id === annee?.id ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-control border px-3 text-sm font-medium md:h-10',
                    a.id === annee?.id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-muted hover:text-fg',
                  )}
                >
                  {a.libelle}
                  <span className="text-xs">· {t.statuts[a.statut]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {modifiable ? (
          <Button
            onClick={() => {
              setEdition('nouvelle');
            }}
          >
            {t.nouvelleAnnee}
          </Button>
        ) : null}
      </div>

      {annee ? (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{annee.libelle}</h2>
                <p className="text-sm text-muted">
                  {t.du(formatDate(annee.dateDebut), formatDate(annee.dateFin))}
                </p>
                <div>
                  <Badge tone={TONS[annee.statut]}>{t.statuts[annee.statut]}</Badge>
                </div>
              </div>
              {modifiable ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void dupliquer()}>
                    {t.dupliquer}
                  </Button>
                  {modifiableAnnee ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEdition('annee');
                        }}
                      >
                        {t.modifierAnnee}
                      </Button>
                      {annee.statut === 'preparation' ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void executer(`/api/annees/${annee.id}`, 'PATCH', {
                                statut: 'en_cours',
                              }).then((ok) => {
                                if (ok) router.refresh();
                              })
                            }
                          >
                            {t.passerEnCours}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setConfirmation({ type: 'suppression-annee' });
                            }}
                          >
                            {t.supprimerAnnee}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setConfirmation({ type: 'cloture' });
                          }}
                        >
                          {t.cloturer}
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
              {confirmation ? null : erreur}
            </p>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t.periodes}</h3>
              <ul className="flex flex-wrap gap-2">
                {annee.periodes.map((p) => (
                  <li key={p.id} className="rounded-control border border-line px-3 py-2 text-sm">
                    <span className="font-semibold">{p.libelle}</span>{' '}
                    <span className="text-muted">
                      {t.du(formatDate(p.dateDebut), formatDate(p.dateFin))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <VueAnnuelle annee={annee} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t.fermetures}</h2>
                {modifiableAnnee ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFermeture('nouvelle');
                    }}
                  >
                    {t.ajouterFermeture}
                  </Button>
                ) : null}
              </div>
              {annee.fermetures.length === 0 ? (
                <p className="text-sm text-muted">{t.aucuneFermeture}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {annee.fermetures.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{f.libelle}</span>
                        <span className="text-xs text-muted">
                          {t.types[f.type]} · {t.du(formatDate(f.dateDebut), formatDate(f.dateFin))}{' '}
                          ·{' '}
                          {f.etablissementIds.length === 0
                            ? t.tousEtablissements
                            : etablissements
                                .filter((e) => f.etablissementIds.includes(e.id))
                                .map((e) => e.nom)
                                .join(', ')}
                        </span>
                      </div>
                      {modifiableAnnee ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            aria-label={`${t.modifierFermeture} ${f.libelle}`}
                            onClick={() => {
                              setFermeture(f);
                            }}
                          >
                            {fr.organisation.modifier}
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label={`${t.supprimerFermeture} ${f.libelle}`}
                            onClick={() => {
                              setErreur(null);
                              setConfirmation({ type: 'suppression-fermeture', fermeture: f });
                            }}
                          >
                            {t.supprimer}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t.feries}</h2>
              <p className="text-xs text-muted">{t.aideFeries}</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {annee.feries.map((f) => (
                  <li key={f.date} className="flex justify-between gap-2">
                    <span>{f.libelle}</span>
                    <span className="text-muted tabular-nums">{formatDate(f.date)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <p className="text-sm text-muted">{t.aucuneAnnee}</p>
        </Card>
      )}

      <AnneeDialog
        mode={edition}
        annee={annee}
        proposition={proposition}
        onFermer={() => {
          setEdition(null);
        }}
        onEnregistre={(id) => {
          setEdition(null);
          router.push(`/parametres/calendrier?annee=${id}`);
          router.refresh();
        }}
      />
      {annee ? (
        <FermetureDialog
          fermeture={fermeture}
          anneeId={annee.id}
          etablissements={etablissements}
          onFermer={() => {
            setFermeture(null);
          }}
          onEnregistre={() => {
            setFermeture(null);
            router.refresh();
          }}
        />
      ) : null}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent
          title={
            confirmation?.type === 'cloture'
              ? t.cloturer
              : confirmation?.type === 'suppression-annee'
                ? t.supprimerAnnee
                : t.supprimerFermeture
          }
        >
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">
              {confirmation?.type === 'cloture'
                ? t.confirmerCloture(annee?.libelle ?? '')
                : confirmation?.type === 'suppression-annee'
                  ? t.confirmerSuppressionAnnee(annee?.libelle ?? '')
                  : t.confirmerSuppressionFermeture(
                      confirmation?.type === 'suppression-fermeture'
                        ? confirmation.fermeture.libelle
                        : '',
                    )}
            </p>
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
              {erreur}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmation(null);
                }}
              >
                {t.annuler}
              </Button>
              <Button variant="danger" onClick={() => void confirmer()}>
                {t.confirmer}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

let compteur = 0;
const cle = () => `p${String(++compteur)}`;

/** Création ou modification d'une année et de ses périodes (US-01-03, RG-01-03). */
function AnneeDialog({
  mode,
  annee,
  proposition,
  onFermer,
  onEnregistre,
}: {
  mode: 'nouvelle' | 'annee' | 'duplication' | null;
  annee: CalendrierAnnee | null;
  /** Année suivante proposée par duplication (RG-01-05), à vérifier avant validation. */
  proposition: PropositionDuplication | null;
  onFermer: () => void;
  onEnregistre: (id: string) => void;
}) {
  const existante = mode === 'annee' ? annee : null;
  const duplication = mode === 'duplication' ? proposition : null;
  const base = existante ?? duplication;
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [periodes, setPeriodes] = useState<PeriodeSaisie[]>([]);
  const [ouverte, setOuverte] = useState<typeof mode>(null);

  // Périodes initialisées à chaque ouverture : celles de l'année, ou deux semestres à dater.
  if (mode !== ouverte) {
    setOuverte(mode);
    setErreurs(SANS_ERREUR);
    setPeriodes(
      existante
        ? existante.periodes.map((p) => ({ ...p, cle: p.id }))
        : duplication
          ? duplication.periodes.map((p) => ({ ...p, cle: cle() }))
          : [
              { cle: cle(), libelle: 'S1', dateDebut: '', dateFin: '' },
              { cle: cle(), libelle: 'S2', dateDebut: '', dateFin: '' },
            ],
    );
  }

  const modifier = (rang: number, champ: 'libelle' | 'dateDebut' | 'dateFin', valeur: string) => {
    setPeriodes(periodes.map((p, i) => (i === rang ? { ...p, [champ]: valeur } : p)));
  };

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const corps = {
      libelle: data.get('libelle'),
      dateDebut: data.get('dateDebut'),
      dateFin: data.get('dateFin'),
      periodes: periodes.map(({ id, libelle, dateDebut, dateFin }) => ({
        ...(id ? { id } : {}),
        libelle,
        dateDebut,
        dateFin,
      })),
      ...(duplication
        ? { fermetures: duplication.fermetures, dupliqueDe: duplication.dupliqueDe }
        : {}),
    };
    const resultat = existante
      ? await envoyer(`/api/annees/${existante.id}`, 'PATCH', corps, t.erreur)
      : await envoyer('/api/annees', 'POST', corps, t.erreur);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      return;
    }
    onEnregistre((resultat.body as { id: string }).id);
  }

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent
        title={existante ? t.modifierAnnee : duplication ? t.dupliquerTitre : t.nouvelleAnnee}
        className="top-[4vh] max-h-[92vh] max-w-2xl overflow-y-auto"
      >
        <form
          key={mode ?? ''}
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => void onSubmit(event)}
        >
          {duplication ? <p className="text-sm text-muted">{t.aideDuplication}</p> : null}
          <Champ
            nom="libelle"
            label={t.champs.libelleAnnee}
            erreurs={erreurs}
            defaultValue={base?.libelle ?? ''}
            placeholder="2026-2027"
            required
            maxLength={80}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              nom="dateDebut"
              label={t.champs.dateDebut}
              erreurs={erreurs}
              type="date"
              defaultValue={base?.dateDebut ?? ''}
              required
            />
            <Champ
              nom="dateFin"
              label={t.champs.dateFin}
              erreurs={erreurs}
              type="date"
              defaultValue={base?.dateFin ?? ''}
              required
            />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t.periodes}</legend>
            {periodes.map((p, rang) => (
              <LignePeriode
                key={p.cle}
                periode={p}
                rang={rang}
                retirable={periodes.length > 1}
                onChange={modifier}
                onRetirer={() => {
                  setPeriodes(periodes.filter((_, i) => i !== rang));
                }}
              />
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                setPeriodes([...periodes, { cle: cle(), libelle: '', dateDebut: '', dateFin: '' }]);
              }}
            >
              {t.ajouterPeriode}
            </Button>
          </fieldset>
          {duplication && duplication.fermetures.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t.fermeturesReprises}</h3>
              <ul className="text-sm text-muted">
                {duplication.fermetures.map((f) => (
                  <li key={`${f.libelle}-${f.dateDebut}`}>
                    {f.libelle} · {t.du(formatDate(f.dateDebut), formatDate(f.dateFin))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <MessageErreur erreurs={erreurs} champs={['libelle', 'dateDebut', 'dateFin']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit">{t.enregistrer}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LignePeriode({
  periode,
  rang,
  retirable,
  onChange,
  onRetirer,
}: {
  periode: PeriodeSaisie;
  rang: number;
  retirable: boolean;
  onChange: (rang: number, champ: 'libelle' | 'dateDebut' | 'dateFin', valeur: string) => void;
  onRetirer: () => void;
}) {
  const id = useId();
  const numero = rang + 1;
  return (
    <div
      role="group"
      aria-label={t.periode(numero)}
      className="grid items-end gap-2 sm:grid-cols-[1fr_150px_150px_auto]"
    >
      {(
        [
          ['libelle', t.champs.libelle, 'text'],
          ['dateDebut', t.champs.dateDebut, 'date'],
          ['dateFin', t.champs.dateFin, 'date'],
        ] as const
      ).map(([champ, label, type]) => (
        <div key={champ} className="flex flex-col gap-1.5">
          <Label
            htmlFor={`${id}-${champ}`}
          >{`${label} (${t.periode(numero).toLowerCase()})`}</Label>
          <Input
            id={`${id}-${champ}`}
            type={type}
            required
            maxLength={80}
            value={periode[champ]}
            onChange={(event) => {
              onChange(rang, champ, event.target.value);
            }}
          />
        </div>
      ))}
      <Button variant="ghost" disabled={!retirable} onClick={onRetirer}>
        {t.retirerPeriode(numero)}
      </Button>
    </div>
  );
}

/** Ajout ou modification d'une fermeture (RG-01-04). */
function FermetureDialog({
  fermeture,
  anneeId,
  etablissements,
  onFermer,
  onEnregistre,
}: {
  fermeture: Fermeture | 'nouvelle' | null;
  anneeId: string;
  etablissements: readonly Etablissement[];
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const existante = fermeture === 'nouvelle' ? null : fermeture;
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const typeId = useId();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const corps = {
      libelle: data.get('libelle'),
      dateDebut: data.get('dateDebut'),
      dateFin: data.get('dateFin'),
      type: data.get('type'),
      etablissementIds: data.getAll('etablissementIds'),
    };
    const resultat = existante
      ? await envoyer(`/api/fermetures/${existante.id}`, 'PUT', corps, t.erreur)
      : await envoyer(`/api/annees/${anneeId}/fermetures`, 'POST', corps, t.erreur);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      return;
    }
    setErreurs(SANS_ERREUR);
    onEnregistre();
  }

  return (
    <Dialog
      open={fermeture !== null}
      onOpenChange={(open) => {
        if (!open) {
          setErreurs(SANS_ERREUR);
          onFermer();
        }
      }}
    >
      <DialogContent
        title={existante ? t.modifierFermeture : t.ajouterFermeture}
        className="top-[4vh] max-h-[92vh] overflow-y-auto"
      >
        <form
          key={existante?.id ?? 'nouvelle'}
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => void onSubmit(event)}
        >
          <Champ
            nom="libelle"
            label={t.champs.libelle}
            erreurs={erreurs}
            defaultValue={existante?.libelle ?? ''}
            placeholder="Vacances de la Toussaint"
            required
            maxLength={80}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={typeId}>{t.champs.type}</Label>
            <select
              id={typeId}
              name="type"
              defaultValue={existante?.type ?? 'vacances'}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-fg md:h-10 md:text-sm"
            >
              {TYPES_FERMETURE.map((type) => (
                <option key={type} value={type}>
                  {t.types[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              nom="dateDebut"
              label={t.champs.dateDebut}
              erreurs={erreurs}
              type="date"
              defaultValue={existante?.dateDebut ?? ''}
              required
            />
            <Champ
              nom="dateFin"
              label={t.champs.dateFin}
              erreurs={erreurs}
              type="date"
              defaultValue={existante?.dateFin ?? ''}
              required
            />
          </div>
          {etablissements.length > 1 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">{t.champs.etablissements}</legend>
              <p className="mb-1 text-xs text-muted">{t.champs.aideEtablissements}</p>
              {etablissements.map((e) => (
                <label key={e.id} className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
                  <input
                    type="checkbox"
                    name="etablissementIds"
                    value={e.id}
                    defaultChecked={existante?.etablissementIds.includes(e.id) ?? false}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {e.nom}
                </label>
              ))}
            </fieldset>
          ) : null}
          <MessageErreur erreurs={erreurs} champs={['libelle', 'dateDebut', 'dateFin']} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit">{t.enregistrer}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
