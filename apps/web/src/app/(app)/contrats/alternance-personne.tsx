'use client';

import {
  TYPES_CONTRAT,
  type ContactEntreprise,
  type Contrat,
  type ConventionStage,
  type Entreprise,
  type ListeContrats,
  type ListeEntreprises,
  type Opco,
  type PersonneResume,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { RecherchePersonne } from '@/components/recherche-personne';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { nombre, SELECT, texte, useEnvoi } from '../formations/envoi';
import { TONS_CONTRAT, TONS_CONVENTION } from './alertes';

const t = fr.contrats;
type Entreprises = ListeEntreprises['entreprises'];

/** Fiche personne : ses contrats et conventions, et le parcours « nouvel alternant » (section 5). */
export function AlternancePersonne({
  liste,
  entreprises,
  opcos,
}: {
  liste: ListeContrats;
  entreprises: Entreprises;
  opcos: readonly Opco[];
}) {
  const [dialogue, setDialogue] = useState<'contrat' | 'convention' | null>(null);
  const inscriptions = liste.inscriptions.filter((i) => i.modifiable);
  const fermer = () => {
    setDialogue(null);
  };
  return (
    <Card className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.alternance}</h2>
        {liste.creation && inscriptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDialogue('contrat');
              }}
            >
              {t.ajouterContrat}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDialogue('convention');
              }}
            >
              {t.ajouterConvention}
            </Button>
          </div>
        ) : null}
      </div>
      {liste.creation && inscriptions.length === 0 ? (
        <p className="text-sm text-muted">{t.sansInscription}</p>
      ) : null}
      {liste.contrats.length + liste.conventions.length === 0 ? (
        <p className="text-sm text-muted">{t.aucunContrat}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {liste.contrats.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link
                href={`/contrats/${c.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {`${t.fiche.contrat(t.types[c.type])} · ${c.entreprise.raisonSociale}`}
              </Link>
              <span className="flex items-center gap-2 text-sm text-muted">
                {t.periode(formatDate(c.debut), formatDate(c.fin))}
                <Badge tone={TONS_CONTRAT[c.statut]}>{t.statuts[c.statut]}</Badge>
              </span>
            </li>
          ))}
          {liste.conventions.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link
                href={`/conventions/${c.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {`${t.fiche.convention} · ${c.entreprise.raisonSociale}`}
              </Link>
              <span className="flex items-center gap-2 text-sm text-muted">
                {t.periode(formatDate(c.debut), formatDate(c.fin))}
                <Badge tone={TONS_CONVENTION[c.statut]}>{t.statutsConvention[c.statut]}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      {dialogue ? (
        <Nouveau
          nature={dialogue}
          inscriptions={inscriptions}
          entreprises={entreprises}
          opcos={opcos}
          onFermer={fermer}
        />
      ) : null}
    </Card>
  );
}

function Nouveau({
  nature,
  inscriptions,
  entreprises,
  opcos,
  onFermer,
}: {
  nature: 'contrat' | 'convention';
  inscriptions: ListeContrats['inscriptions'];
  entreprises: Entreprises;
  opcos: readonly Opco[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const { erreurs, envoi, executer } = useEnvoi();
  const ids = {
    inscription: useId(),
    entreprise: useId(),
    type: useId(),
    opco: useId(),
    tuteur: useId(),
    missions: useId(),
  };
  const [tuteurs, setTuteurs] = useState<ContactEntreprise[] | null>(null);
  const [referent, setReferent] = useState<PersonneResume | null>(null);
  const titre = nature === 'contrat' ? t.ajouterContrat : t.ajouterConvention;

  async function choisirEntreprise(id: string) {
    setTuteurs(null);
    if (!id) return;
    const reponse = await fetch(`/api/entreprises/${id}`);
    const corps = (await reponse.json().catch(() => null)) as Entreprise | null;
    setTuteurs((corps?.contacts ?? []).filter((c) => c.type === 'tuteur'));
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const commun = {
      inscriptionId: texte(d.get('inscriptionId')),
      entrepriseId: texte(d.get('entrepriseId')),
      debut: texte(d.get('debut')),
      fin: texte(d.get('fin')),
    };
    if (nature === 'contrat') {
      const opco = texte(d.get('opco'));
      const resultat = await executer('/api/contrats', 'POST', {
        ...commun,
        type: texte(d.get('type')),
        tuteurIds: d.getAll('tuteurIds'),
        numeroDepot: texte(d.get('numeroDepot')) || null,
        referentId: referent?.id ?? null,
        formationProlongee: d.get('formationProlongee') === 'on',
        ...(opco ? { opco } : {}),
      });
      if (resultat.ok) router.push(`/contrats/${(resultat.body as Contrat).id}`);
      return;
    }
    const gratification = nombre(d.get('gratification'));
    const resultat = await executer('/api/conventions-stage', 'POST', {
      ...commun,
      tuteurId: texte(d.get('tuteurId')) || null,
      referentId: referent?.id ?? '',
      heuresPresence: nombre(d.get('heuresPresence')),
      missions: texte(d.get('missions')) || null,
      gratificationHoraire: gratification === undefined ? null : Math.round(gratification * 100),
      derogationMotif: texte(d.get('derogationMotif')) || null,
    });
    if (resultat.ok) router.push(`/conventions/${(resultat.body as ConventionStage).id}`);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={titre} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void onSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.inscription}>{t.champs.inscription}</Label>
            <select id={ids.inscription} name="inscriptionId" className={SELECT}>
              {inscriptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.promotion.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.entreprise}>{t.champs.entreprise}</Label>
            <select
              id={ids.entreprise}
              name="entrepriseId"
              defaultValue=""
              required
              className={SELECT}
              onChange={(e) => void choisirEntreprise(e.target.value)}
            >
              <option value="" disabled>
                {t.champs.choisirEntreprise}
              </option>
              {entreprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {`${e.raisonSociale}${e.ville ? ` · ${e.ville}` : ''}`}
                </option>
              ))}
            </select>
          </div>
          {tuteurs === null ? null : tuteurs.length === 0 ? (
            <p className="text-sm text-warn">{t.champs.aucunTuteur}</p>
          ) : nature === 'contrat' ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t.champs.tuteurs}</legend>
              {tuteurs.map((c, rang) => (
                <label
                  key={c.personne.id}
                  className="flex min-h-11 items-center gap-2 text-sm md:min-h-0"
                >
                  <input
                    type="checkbox"
                    name="tuteurIds"
                    value={c.personne.id}
                    defaultChecked={rang === 0}
                    className="size-4"
                  />
                  {`${c.personne.prenom} ${c.personne.nom}`}
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.tuteur}>{t.champs.tuteur}</Label>
              <select id={ids.tuteur} name="tuteurId" className={SELECT}>
                <option value="">{t.champs.sansTuteur}</option>
                {tuteurs.map((c) => (
                  <option key={c.personne.id} value={c.personne.id}>
                    {`${c.personne.prenom} ${c.personne.nom}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {nature === 'contrat' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.type}>{t.champs.type}</Label>
              <select id={ids.type} name="type" className={SELECT}>
                {TYPES_CONTRAT.map((x) => (
                  <option key={x} value={x}>
                    {t.types[x]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ nom="debut" label={t.champs.debut} erreurs={erreurs} type="date" required />
            <Champ nom="fin" label={t.champs.fin} erreurs={erreurs} type="date" required />
          </div>
          {nature === 'contrat' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.opco}>{t.champs.opco}</Label>
                <select id={ids.opco} name="opco" defaultValue="" className={SELECT}>
                  <option value="">{t.champs.opcoAide}</option>
                  {opcos.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <Champ
                nom="numeroDepot"
                label={t.champs.numeroDepot}
                erreurs={erreurs}
                maxLength={40}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <input type="checkbox" name="formationProlongee" className="size-4" />
                {t.champs.prolongee}
              </label>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ
                  nom="heuresPresence"
                  label={t.champs.heures}
                  erreurs={erreurs}
                  inputMode="decimal"
                  required
                />
                <Champ
                  nom="gratification"
                  label={t.champs.gratification}
                  aide={t.champs.gratificationAide}
                  erreurs={erreurs}
                  inputMode="decimal"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.missions}>{t.champs.missions}</Label>
                <textarea
                  id={ids.missions}
                  name="missions"
                  rows={3}
                  maxLength={4000}
                  className="rounded-control border border-line bg-surface px-3 py-2 text-base md:text-sm"
                />
              </div>
              <Champ
                nom="derogationMotif"
                label={t.champs.derogation}
                aide={t.champs.derogationAide}
                erreurs={erreurs}
                maxLength={500}
              />
            </>
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">
              {nature === 'contrat' ? t.champs.referent : t.champs.referentObligatoire}
            </legend>
            <RecherchePersonne choisie={referent} onChoisir={setReferent} />
          </fieldset>
          <MessageErreur
            erreurs={erreurs}
            champs={['debut', 'fin', 'numeroDepot', 'heuresPresence', 'derogationMotif']}
          />
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
