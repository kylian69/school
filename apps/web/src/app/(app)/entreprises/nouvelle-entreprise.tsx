'use client';

import type { Entreprise, Opco, RechercheSiret } from '@scolaly/contracts';
import { Button, Dialog, DialogContent, Label } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { SELECT, texte, useEnvoi } from '../formations/envoi';

const t = fr.entreprises;

/** US-03-01 : création par le SIRET, pré-remplie par l'annuaire ; sinon saisie manuelle. */
export function NouvelleEntreprise({ opcos }: { opcos: readonly Opco[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOuvert(true);
        }}
      >
        {t.nouvelle}
      </Button>
      {ouvert ? (
        <Creation
          opcos={opcos}
          onFermer={() => {
            setOuvert(false);
          }}
        />
      ) : null}
    </>
  );
}

function Creation({ opcos, onFermer }: { opcos: readonly Opco[]; onFermer: () => void }) {
  const router = useRouter();
  const { erreurs, setErreurs, envoi, executer } = useEnvoi();
  const idOpco = useId();
  const [recherche, setRecherche] = useState<RechercheSiret | null>(null);
  const [cherche, setCherche] = useState(false);
  const libelleOpco = (code: string | null) => opcos.find((o) => o.code === code)?.libelle ?? code;

  async function chercher(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const siret = texte(new FormData(event.currentTarget).get('siret')).replace(/\s+/g, '');
    setCherche(true);
    const reponse = await fetch(`/api/entreprises/siret/${encodeURIComponent(siret)}`);
    setCherche(false);
    const body = (await reponse.json().catch(() => null)) as
      (RechercheSiret & { message?: string; details?: string[] }) | null;
    if (!reponse.ok || !body) {
      setRecherche(null);
      setErreurs({ message: body?.message ?? t.erreur, details: body?.details ?? [] });
      return;
    }
    setErreurs({ message: null, details: [] });
    setRecherche(body);
  }

  async function creer(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!recherche) return;
    const d = new FormData(event.currentTarget);
    const manuelle = recherche.annuaire !== 'trouve';
    const opco = texte(d.get('opco'));
    const resultat = await executer('/api/entreprises', 'POST', {
      siret: recherche.siret,
      ...(opco ? { opco } : {}),
      ...(manuelle
        ? {
            raisonSociale: texte(d.get('raisonSociale')),
            adresse: texte(d.get('adresse')) || null,
            codePostal: texte(d.get('codePostal')) || null,
            ville: texte(d.get('ville')) || null,
            idcc: texte(d.get('idcc')) || null,
          }
        : {}),
    });
    if (resultat.ok) router.push(`/entreprises/${(resultat.body as Entreprise).id}`);
  }

  const fiche = recherche?.fiche;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFermer();
      }}
    >
      <DialogContent title={t.nouvelle} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col gap-4 p-5">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void chercher(e)}>
            <div className="min-w-0 flex-1">
              <Champ
                nom="siret"
                label={t.creation.siret}
                erreurs={erreurs}
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={20}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={cherche}>
              {t.creation.chercher}
            </Button>
          </form>

          {recherche?.existante ? (
            <p role="status" className="text-sm">
              {t.creation.existante}{' '}
              <Link href={`/entreprises/${recherche.existante}`} className="font-medium underline">
                {t.creation.ouvrir}
              </Link>
            </p>
          ) : recherche ? (
            <form className="flex flex-col gap-4" onSubmit={(e) => void creer(e)}>
              {fiche ? (
                <div role="status" className="flex flex-col gap-1 text-sm">
                  <p className="text-muted">{t.creation.trouvee}</p>
                  <p className="font-semibold">{fiche.raisonSociale}</p>
                  <p>
                    {[fiche.adresse, [fiche.codePostal, fiche.ville].filter(Boolean).join(' ')]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {fiche.ferme ? <p className="text-warn">{t.creation.fermee}</p> : null}
                  {fiche.opcoPropose ? (
                    <p className="text-muted">
                      {t.creation.opcoPropose(libelleOpco(fiche.opcoPropose) ?? '')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p role="status" className="text-sm text-warn">
                    {recherche.annuaire === 'indisponible'
                      ? t.creation.indisponible
                      : t.creation.introuvable}
                  </p>
                  <Champ
                    nom="raisonSociale"
                    label={t.champs.raisonSociale}
                    erreurs={erreurs}
                    required
                    maxLength={200}
                  />
                  <Champ nom="adresse" label={t.champs.adresse} erreurs={erreurs} maxLength={200} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Champ
                      nom="codePostal"
                      label={t.champs.codePostal}
                      erreurs={erreurs}
                      maxLength={10}
                    />
                    <Champ nom="ville" label={t.champs.ville} erreurs={erreurs} maxLength={80} />
                  </div>
                  <Champ
                    nom="idcc"
                    label={t.champs.idcc}
                    aide={t.champs.idccAide}
                    erreurs={erreurs}
                    maxLength={10}
                  />
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={idOpco}>{t.champs.opco}</Label>
                <select
                  id={idOpco}
                  name="opco"
                  defaultValue={fiche?.opcoPropose ?? ''}
                  className={SELECT}
                >
                  <option value="">{t.champs.aucunOpco}</option>
                  {opcos.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <MessageErreur
                erreurs={erreurs}
                champs={['raisonSociale', 'adresse', 'codePostal', 'ville', 'idcc', 'siret']}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onFermer}>
                  {t.annuler}
                </Button>
                <Button type="submit" disabled={envoi}>
                  {t.creation.creer}
                </Button>
              </div>
            </form>
          ) : (
            <MessageErreur erreurs={erreurs} champs={['siret']} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
