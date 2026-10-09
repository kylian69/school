'use client';

import {
  IMPORT_ANNULATIONS_MAX,
  type CorrespondanceEdt,
  type ResultatImportEdt,
} from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import Link from 'next/link';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';
import { formatDateHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';
import { SELECT } from '../../formations/envoi';

const t = fr.importEdt;
const TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ics: 'text/calendar',
};
type Version = 'scolaly' | 'fichier';
type Nature = CorrespondanceEdt['nature'];
const cle = (nature: Nature, libelle: string) => `${nature}|${libelle}`;
const SANS_OBJET = '-';

/**
 * E-04-03 · Import d'un emploi du temps : dépôt, correspondance des libellés inconnus (mémorisée),
 * aperçu avec erreurs ligne par ligne, conflits et séances disparues, puis import.
 */
export function ImportEdt({
  etablissements,
  promotions,
}: {
  etablissements: { id: string; nom: string }[];
  promotions: { id: string; libelle: string; etablissementId: string }[];
}) {
  const ids = {
    etablissement: useId(),
    fichier: useId(),
    public: useId(),
    version: useId(),
  };
  const [etablissementId, setEtablissementId] = useState(etablissements[0]?.id ?? '');
  const [promotionId, setPromotionId] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [publier, setPublier] = useState(false);
  const [lignesValides, setLignesValides] = useState(false);
  const [version, setVersion] = useState<Version>('scolaly');
  const [resultat, setResultat] = useState<ResultatImportEdt | null>(null);
  const [choisis, setChoisis] = useState<Record<string, string>>({});
  /** RG-04-11 : séances disparues à annuler ; aucune cochée par défaut. */
  const [aAnnuler, setAAnnuler] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const oublier = () => {
    setResultat(null);
    setAAnnuler(new Set());
    setErreur(null);
  };

  async function deposer(apercu: boolean) {
    if (!fichier) return;
    const type = TYPES[fichier.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!type) {
      setErreur(t.formatInconnu);
      return;
    }
    const params = new URLSearchParams({
      etablissementId,
      apercu: String(apercu),
      publier: String(publier),
      lignesValides: String(lignesValides),
      versionConservee: version,
    });
    if (promotionId) params.set('promotionId', promotionId);
    if (!apercu && aAnnuler.size > 0) {
      if (aAnnuler.size > IMPORT_ANNULATIONS_MAX) {
        setErreur(t.disparuesTrop(IMPORT_ANNULATIONS_MAX));
        return;
      }
      params.set('annuler', [...aAnnuler].join(','));
    }
    setEnvoi(true);
    const reponse = await envoyer(
      `/api/edt/import?${params.toString()}`,
      'POST',
      new Blob([fichier], { type }),
      t.erreur,
    );
    setEnvoi(false);
    if (!reponse.ok) {
      setErreur([reponse.erreur, ...reponse.details].join(' '));
      setResultat(null);
      return;
    }
    const recu = reponse.body as ResultatImportEdt;
    setErreur(null);
    setResultat(recu);
    // Un nouvel aperçu ne garde que les cases encore proposées ; l'import les a traitées.
    const proposees = new Set(recu.disparues.filter((d) => d.refus === null).map((d) => d.id));
    setAAnnuler(
      recu.importe ? new Set() : new Set([...aAnnuler].filter((id) => proposees.has(id))),
    );
  }

  async function enregistrerCorrespondances() {
    if (!resultat) return;
    const correspondances = resultat.inconnus.map((i) => {
      const valeur = choisis[cle(i.nature, i.libelle)] ?? '';
      return {
        nature: i.nature,
        libelle: i.libelle,
        objetId: valeur === SANS_OBJET || valeur === '' ? null : valeur,
        complet: valeur !== '',
      };
    });
    if (correspondances.some((c) => !c.complet)) {
      setErreur(t.correspondances.incompletes);
      return;
    }
    setEnvoi(true);
    const reponse = await envoyer(
      '/api/edt/import/correspondances',
      'PUT',
      { correspondances: correspondances.map(({ complet: _complet, ...c }) => c) },
      t.erreur,
    );
    setEnvoi(false);
    if (!reponse.ok) {
      setErreur([reponse.erreur, ...reponse.details].join(' '));
      return;
    }
    await deposer(true);
  }

  const contenuModele = [String.fromCharCode(0xfeff) + t.modele, t.exemple].join('\r\n') + '\r\n';
  const lienModele = `data:text/csv;charset=utf-8,${encodeURIComponent(contenuModele)}`;
  const rejetees = resultat?.erreurs ?? [];
  const lienRapport = `data:text/csv;charset=utf-8,${encodeURIComponent(
    [
      String.fromCharCode(0xfeff) + 'Ligne;Erreur',
      ...rejetees.map((e) => `${String(e.ligne ?? '')};"${e.message.replaceAll('"', '""')}"`),
    ].join('\r\n'),
  )}`;
  const annulables = (resultat?.disparues ?? []).filter((d) => d.refus === null).map((d) => d.id);
  const toutesCochees = annulables.length > 0 && annulables.every((id) => aAnnuler.has(id));
  const importable =
    resultat !== null &&
    !resultat.importe &&
    resultat.inconnus.length === 0 &&
    (resultat.erreurs.length === 0 || lignesValides);

  return (
    <>
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
            event.preventDefault();
            void deposer(true);
          }}
        >
          <div className="flex flex-col gap-1 text-sm">
            <p>
              {t.colonnes}{' '}
              <span className="font-mono text-xs">{t.modele.replaceAll(';', ' · ')}</span>
            </p>
            <p className="text-muted">{t.noteModele}</p>
            <a
              href={lienModele}
              download="modele-emploi-du-temps.csv"
              className="self-start text-accent underline underline-offset-4"
            >
              {t.telecharger}
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {etablissements.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.etablissement}>{t.etablissement}</Label>
                <select
                  id={ids.etablissement}
                  className={SELECT}
                  value={etablissementId}
                  onChange={(e) => {
                    setEtablissementId(e.target.value);
                    setPromotionId('');
                    oublier();
                  }}
                >
                  {etablissements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nom}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.public}>{t.publicDefaut}</Label>
              <select
                id={ids.public}
                className={SELECT}
                value={promotionId}
                onChange={(e) => {
                  setPromotionId(e.target.value);
                  oublier();
                }}
              >
                <option value="">{t.aucunPublic}</option>
                {promotions
                  .filter((p) => p.etablissementId === etablissementId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.libelle}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.version}>{t.versionConservee}</Label>
              <select
                id={ids.version}
                className={SELECT}
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value as Version);
                  oublier();
                }}
              >
                {(['scolaly', 'fichier'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t.versions[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.fichier}>{t.fichier}</Label>
              <input
                id={ids.fichier}
                type="file"
                accept=".csv,.xlsx,.ics"
                required
                className="text-sm"
                onChange={(e) => {
                  setFichier(e.target.files?.[0] ?? null);
                  oublier();
                }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publier}
              onChange={(e) => {
                setPublier(e.target.checked);
                oublier();
              }}
            />
            {t.publier}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lignesValides}
              onChange={(e) => {
                setLignesValides(e.target.checked);
              }}
            />
            {t.lignesValides}
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="submit"
              variant={importable ? 'secondary' : 'primary'}
              disabled={envoi || !fichier}
            >
              {t.verifier}
            </Button>
            {importable ? (
              <Button disabled={envoi} onClick={() => void deposer(false)}>
                {t.importer}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <div role="status" aria-live="polite" className="flex flex-col gap-4 text-sm">
        {envoi ? <p className="text-muted">{t.enCours}</p> : null}
        {erreur ? <p className="text-bad">{erreur}</p> : null}
        {resultat && resultat.inconnus.length > 0 ? (
          <Card>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
                event.preventDefault();
                void enregistrerCorrespondances();
              }}
            >
              <h2 className="text-base font-semibold">{t.correspondances.titre}</h2>
              <p className="text-muted">{t.correspondances.aide}</p>
              {resultat.inconnus.map((i) => {
                const id = `${ids.fichier}-${cle(i.nature, i.libelle)}`;
                return (
                  <div key={cle(i.nature, i.libelle)} className="grid gap-1.5 md:grid-cols-2">
                    <Label htmlFor={id}>
                      {t.correspondances.natures[i.nature]} « {i.libelle} »{' '}
                      <span className="text-muted">
                        ({t.correspondances.lignes(i.lignes.slice(0, 10).join(', '))})
                      </span>
                    </Label>
                    <select
                      id={id}
                      className={SELECT}
                      value={choisis[cle(i.nature, i.libelle)] ?? ''}
                      onChange={(e) => {
                        setChoisis({ ...choisis, [cle(i.nature, i.libelle)]: e.target.value });
                      }}
                    >
                      <option value="">{t.correspondances.choisir}</option>
                      {i.nature !== 'public' ? (
                        <option value={SANS_OBJET}>{t.correspondances.sansObjet[i.nature]}</option>
                      ) : null}
                      {resultat.choix
                        .filter((c) => c.nature === i.nature)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.libelle}
                          </option>
                        ))}
                    </select>
                  </div>
                );
              })}
              <Button type="submit" className="self-end" disabled={envoi}>
                {t.correspondances.enregistrer}
              </Button>
            </form>
          </Card>
        ) : null}
        {resultat && resultat.inconnus.length === 0 ? (
          <Card>
            <div className="flex flex-col gap-3">
              <p className={resultat.erreurs.length > 0 && !resultat.importe ? 'text-bad' : ''}>
                {resultat.importe
                  ? t.resume.importe
                  : resultat.erreurs.length > 0
                    ? t.resume.aCorriger(resultat.erreurs.length)
                    : t.resume.pret}{' '}
                {t.resume.compteurs(resultat.compteurs)}
              </p>
              {resultat.importe ? (
                <Link
                  href={`/emploi-du-temps?etablissement=${etablissementId}`}
                  className="self-start text-accent underline underline-offset-4"
                >
                  {t.voirPlanificateur}
                </Link>
              ) : null}
              {resultat.erreurs.length > 0 ? (
                <>
                  <ul className="list-disc pl-5 text-bad">
                    {resultat.erreurs.map((e, rang) => (
                      <li key={`${String(e.ligne)}-${String(rang)}`}>
                        {e.ligne === null ? e.message : t.ligne(e.ligne, e.message)}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={lienRapport}
                    download="lignes-rejetees.csv"
                    className="self-start text-accent underline underline-offset-4"
                  >
                    {t.rapport}
                  </a>
                </>
              ) : null}
              {resultat.avertissements.length > 0 ? (
                <ul className="list-disc pl-5 text-warn">
                  {resultat.avertissements.map((a, rang) => (
                    <li key={`${String(a.ligne)}-${String(rang)}`}>
                      {a.ligne === null ? a.message : t.ligne(a.ligne, a.message)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        ) : null}
        {resultat && resultat.seances.length > 0 ? (
          <Card>
            <h2 className="mb-3 text-base font-semibold">{t.seances}</h2>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.seances}>
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    {Object.values(t.colonnesTableau).map((c) => (
                      <th key={c} scope="col" className="py-1 pr-3 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultat.seances.map((s) => {
                    const bloquants = s.conflits.filter((c) => c.niveau === 'bloquant').length;
                    return (
                      <tr key={s.identifiant} className="border-t border-line">
                        <td className="py-1 pr-3 num">{s.ligne}</td>
                        <td className="py-1 pr-3 num">{formatDateHeure(s.debut)}</td>
                        <td className="py-1 pr-3">{s.libelle}</td>
                        <td className="py-1 pr-3">{t.actions[s.action]}</td>
                        <td className={`py-1 pr-3 ${bloquants > 0 ? 'text-bad' : ''}`}>
                          {t.conflits(bloquants, s.conflits.length - bloquants)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
        {resultat && resultat.disparues.length > 0 ? (
          <Card>
            <h2 className="text-base font-semibold">{t.disparues}</h2>
            <p className="mb-2 text-muted">
              {resultat.importe ? t.disparuesApresImport : t.disparuesAide}
            </p>
            {!resultat.importe && annulables.length > 0 ? (
              <label className="mb-2 flex min-h-11 items-center gap-2 font-medium md:min-h-0">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={toutesCochees}
                  onChange={(e) => {
                    setAAnnuler(new Set(e.target.checked ? annulables : []));
                  }}
                />
                {t.disparuesToutCocher(annulables.length)}
              </label>
            ) : null}
            <ul className="flex flex-col gap-1">
              {resultat.disparues.map((d) => {
                const libelle = `${formatDateHeure(d.debut)} · ${d.libelle}`;
                if (resultat.importe || d.refus !== null)
                  return (
                    <li key={d.id} className="flex min-h-11 items-center gap-2 md:min-h-0">
                      <span>{libelle}</span>
                      <span className={d.annulee ? 'text-bad' : 'text-muted'}>
                        {d.annulee
                          ? t.disparueAnnulee
                          : d.refus !== null
                            ? t.disparueNonAnnulable[d.refus]
                            : t.disparueConservee}
                      </span>
                    </li>
                  );
                return (
                  <li key={d.id}>
                    <label className="flex min-h-11 items-center gap-2 md:min-h-0">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        checked={aAnnuler.has(d.id)}
                        onChange={(e) => {
                          const suivant = new Set(aAnnuler);
                          if (e.target.checked) suivant.add(d.id);
                          else suivant.delete(d.id);
                          setAAnnuler(suivant);
                        }}
                      />
                      {t.disparueAAnnuler(libelle)}
                    </label>
                  </li>
                );
              })}
            </ul>
            {!resultat.importe && aAnnuler.size > 0 ? (
              <p className="mt-2 text-warn">{t.disparuesCochees(aAnnuler.size)}</p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
