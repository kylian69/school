'use client';

import { TYPES_REGLE_PARTICULIERE, type RegleParticuliere } from '@scolaly/contracts';
import { Label } from '@scolaly/ui';
import { useId, useState } from 'react';
import { Champ, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { nombre, SELECT, texte } from './envoi';

const t = fr.referentiel;
const tp = t.ecole.parametres;

type Type = RegleParticuliere['type'];

/** Cibles proposées : la moyenne générale, et les UE et modules de la version s'il y en a une. */
export interface CiblesRegle {
  ues: readonly { id: string; code: string; intitule: string }[];
  modules: readonly { id: string; code: string; intitule: string }[];
}

const cibleVersTexte = (cible: { niveau: string; id?: string } | null | undefined) =>
  !cible || cible.niveau === 'generale' ? 'generale' : `${cible.niveau}:${cible.id ?? ''}`;

function texteVersCible(valeur: string) {
  if (valeur === 'generale' || !valeur.includes(':')) return { niveau: 'generale' as const };
  const [niveau, id = ''] = valeur.split(':');
  return { niveau: niveau === 'module' ? ('module' as const) : ('ue' as const), id };
}

/** Lit les paramètres d'une règle dans le formulaire (les erreurs viennent de l'API). */
export function lireRegle(d: FormData): unknown {
  const type = texte(d.get('typeRegle')) as Type;
  const n = (nom: string) => nombre(d.get(nom));
  switch (type) {
    case 'bonus':
      return {
        type,
        valeur: n('valeur'),
        unite: texte(d.get('unite')),
        cible: texteVersCible(texte(d.get('cible'))),
        plafond: n('plafond') ?? null,
        automatique: d.get('automatique') === 'on',
      };
    case 'ue_bonus': {
      const source = texteVersCible(texte(d.get('source')));
      return {
        type,
        source: source.niveau === 'generale' ? null : source,
        seuil: n('seuil'),
        diviseur: n('diviseur'),
        cible: texteVersCible(texte(d.get('cible'))),
      };
    }
    case 'points_jury':
      return {
        type,
        maximum: n('maximum'),
        seuils: texte(d.get('seuils'))
          .split(/[;\s]+/)
          .filter(Boolean)
          .map((s) => Number(s.replace(',', '.'))),
      };
    case 'plafond':
      return {
        type,
        typeEvaluation: texte(d.get('typeEvaluation')),
        sens: texte(d.get('sens')),
        valeur: n('valeurPlafond'),
      };
    case 'ponderation':
      return {
        type,
        poids: texte(d.get('poids'))
          .split('\n')
          .map((ligne) => ligne.split('='))
          .filter(([cle]) => cle?.trim())
          .map(([cle = '', poids = '']) => ({
            typeEvaluation: cle.trim(),
            poids: Number(poids.trim().replace(',', '.')),
          })),
      };
    case 'penalite_absence':
      return { type, typeAbsence: texte(d.get('typeAbsence')), note: n('note') };
  }
}

/** Paramètres d'une règle particulière selon son type (RG-02-26). */
export function ChampsRegle({
  regle,
  erreurs,
  cibles,
}: {
  regle?: RegleParticuliere;
  erreurs: Erreurs;
  cibles?: CiblesRegle;
}) {
  const [type, setType] = useState<Type>(regle?.type ?? 'bonus');
  const ids = {
    type: useId(),
    unite: useId(),
    cible: useId(),
    source: useId(),
    sens: useId(),
    absence: useId(),
    poids: useId(),
  };
  const bonus = regle?.type === 'bonus' ? regle : undefined;
  const ueBonus = regle?.type === 'ue_bonus' ? regle : undefined;
  const jury = regle?.type === 'points_jury' ? regle : undefined;
  const plafond = regle?.type === 'plafond' ? regle : undefined;
  const ponderation = regle?.type === 'ponderation' ? regle : undefined;
  const penalite = regle?.type === 'penalite_absence' ? regle : undefined;

  const optionsCible = (avecGenerale: boolean) => (
    <>
      {avecGenerale ? <option value="generale">{tp.generale}</option> : null}
      {cibles?.ues.map((u) => (
        <option
          key={u.id}
          value={`ue:${u.id}`}
        >{`${t.maquette.ue} ${u.code} · ${u.intitule}`}</option>
      ))}
      {cibles?.modules.map((m) => (
        <option
          key={m.id}
          value={`module:${m.id}`}
        >{`${t.maquette.module} ${m.code} · ${m.intitule}`}</option>
      ))}
    </>
  );
  const choixCible = (
    nom: string,
    defaut: string,
    id: string,
    libelle: string,
    avecGenerale = true,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{libelle}</Label>
      <select id={id} name={nom} defaultValue={defaut} className={SELECT}>
        {optionsCible(avecGenerale)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.type}>{tp.type}</Label>
        <select
          id={ids.type}
          name="typeRegle"
          value={type}
          onChange={(e) => {
            setType(e.target.value as Type);
          }}
          className={SELECT}
        >
          {TYPES_REGLE_PARTICULIERE.map((code) => (
            <option key={code} value={code}>
              {t.typesRegle[code]}
            </option>
          ))}
        </select>
      </div>
      {type === 'bonus' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="valeur"
            label={tp.valeur}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={bonus?.valeur ?? 0.5}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.unite}>{tp.unite}</Label>
            <select
              id={ids.unite}
              name="unite"
              defaultValue={bonus?.unite ?? 'points'}
              className={SELECT}
            >
              <option value="points">{tp.points}</option>
              <option value="pourcentage">{tp.pourcentage}</option>
            </select>
          </div>
          {choixCible('cible', cibleVersTexte(bonus?.cible), ids.cible, tp.cible)}
          <Champ
            nom="plafond"
            label={tp.plafond}
            erreurs={erreurs}
            type="number"
            step="0.01"
            min={0}
            max={20}
            defaultValue={bonus?.plafond ?? ''}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="automatique"
              defaultChecked={bonus?.automatique ?? false}
              className="size-4"
            />
            {tp.automatique}
          </label>
        </div>
      ) : null}
      {type === 'ue_bonus' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cibles
            ? choixCible('source', cibleVersTexte(ueBonus?.source), ids.source, tp.source, false)
            : null}
          {choixCible('cible', cibleVersTexte(ueBonus?.cible), ids.cible, tp.cible)}
          <Champ
            nom="seuil"
            label={tp.seuil}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={ueBonus?.seuil ?? 10}
            required
          />
          <Champ
            nom="diviseur"
            label={tp.diviseur}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={ueBonus?.diviseur ?? 20}
            required
          />
        </div>
      ) : null}
      {type === 'points_jury' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="maximum"
            label={tp.maximum}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={jury?.maximum ?? 0.3}
            required
          />
          <Champ
            nom="seuils"
            label={tp.seuils}
            erreurs={erreurs}
            defaultValue={(jury?.seuils ?? [10]).join(' ; ')}
          />
        </div>
      ) : null}
      {type === 'plafond' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ
            nom="typeEvaluation"
            label={tp.typeEvaluation}
            erreurs={erreurs}
            defaultValue={plafond?.typeEvaluation ?? 'rattrapage'}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.sens}>{tp.sens}</Label>
            <select
              id={ids.sens}
              name="sens"
              defaultValue={plafond?.sens ?? 'plafond'}
              className={SELECT}
            >
              <option value="plafond">{tp.plafonnee}</option>
              <option value="plancher">{tp.plancher}</option>
            </select>
          </div>
          <Champ
            nom="valeurPlafond"
            label={tp.valeur}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={plafond?.valeur ?? 10}
            required
          />
        </div>
      ) : null}
      {type === 'ponderation' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.poids}>{tp.poids}</Label>
          <textarea
            id={ids.poids}
            name="poids"
            rows={3}
            defaultValue={(
              ponderation?.poids ?? [
                { typeEvaluation: 'controle_continu', poids: 40 },
                { typeEvaluation: 'examen', poids: 60 },
              ]
            )
              .map((p) => `${p.typeEvaluation} = ${String(p.poids)}`)
              .join('\n')}
            className="rounded-control border border-line bg-surface px-3 py-2 text-base md:text-sm"
          />
        </div>
      ) : null}
      {type === 'penalite_absence' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.absence}>{tp.typeAbsence}</Label>
            <select
              id={ids.absence}
              name="typeAbsence"
              defaultValue={penalite?.typeAbsence ?? 'injustifiee'}
              className={SELECT}
            >
              <option value="injustifiee">{tp.injustifiee}</option>
              <option value="justifiee">{tp.justifiee}</option>
            </select>
          </div>
          <Champ
            nom="note"
            label={tp.note}
            erreurs={erreurs}
            type="number"
            step="0.01"
            defaultValue={penalite?.note ?? 0}
            required
          />
        </div>
      ) : null}
    </div>
  );
}

/** Résumé lisible des paramètres d'une règle. */
export function resumeRegle(regle: RegleParticuliere): string {
  const r = tp.resume;
  const c = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
  switch (regle.type) {
    case 'bonus':
      return r.bonus(
        `${regle.valeur >= 0 ? '+' : ''}${c(regle.valeur)}`,
        regle.unite === 'points',
        regle.automatique,
      );
    case 'ue_bonus':
      return r.ueBonus(c(regle.seuil), c(regle.diviseur));
    case 'points_jury':
      return r.jury(c(regle.maximum), regle.seuils.map(c).join(', '));
    case 'plafond':
      return r.plafond(regle.typeEvaluation, regle.sens === 'plafond', c(regle.valeur));
    case 'ponderation':
      return regle.poids.map((p) => `${p.typeEvaluation} ${c(p.poids)}`).join(' · ');
    case 'penalite_absence':
      return r.penalite(regle.typeAbsence === 'injustifiee', c(regle.note));
  }
}
