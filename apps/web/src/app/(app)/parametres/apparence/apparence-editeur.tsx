'use client';

import { LOGO_TAILLE_MAX, type ApparenceEcole } from '@scolaly/contracts';
import { Button, Card, cn, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.apparence;
/** Couleur de Scolaly (jeton --accent du thème clair), quand l'école n'en choisit pas. */
const COULEUR_SCOLALY = '#4F46E5';
const NUANCES = Object.keys(t.nuances);
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function ApparenceEditeur({
  apparence,
  nomEcole,
}: {
  apparence: ApparenceEcole;
  nomEcole: string;
}) {
  const router = useRouter();
  const couleurId = useId();
  const nuancierId = useId();
  const logoId = useId();
  const [nom, setNom] = useState(apparence.nomAffichage);
  const [couleur, setCouleur] = useState(apparence.couleur ?? COULEUR_SCOLALY);
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [proposition, setProposition] = useState<string | null>(null);
  const [erreurLogo, setErreurLogo] = useState<string | null>(null);
  const [envoiLogo, setEnvoiLogo] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const apercu = HEX.test(couleur) ? couleur : COULEUR_SCOLALY;

  async function enregistrer(corps: { nomAffichage?: string; couleur: string | null }) {
    setEnvoi(true);
    const resultat = await envoyer('/api/apparence', 'PATCH', corps, t.erreur);
    setEnvoi(false);
    setEnregistre(resultat.ok);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      const suggestion = (resultat.body as { proposition?: unknown } | null)?.proposition;
      setProposition(typeof suggestion === 'string' ? suggestion : null);
      return;
    }
    setErreurs(SANS_ERREUR);
    setProposition(null);
    router.refresh();
  }

  async function deposer(fichier: File | undefined) {
    if (!fichier) return;
    if (fichier.size > LOGO_TAILLE_MAX) {
      setErreurLogo('Le logo dépasse 2 Mo. Réduisez-le ou exportez-le en SVG.');
      return;
    }
    setEnvoiLogo(true);
    const resultat = await envoyer('/api/apparence/logo', 'PUT', fichier, t.erreur);
    setEnvoiLogo(false);
    setErreurLogo(
      resultat.ok
        ? null
        : (resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur),
    );
    if (resultat.ok) router.refresh();
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    void enregistrer({ nomAffichage: nom, couleur });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          <Champ
            nom="nomAffichage"
            label={t.nomAffichage}
            aide={t.aideNom}
            erreurs={erreurs}
            value={nom}
            onChange={(event) => {
              setNom(event.target.value);
            }}
            required
            maxLength={40}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={logoId}>{t.logo}</Label>
            <div className="flex flex-wrap items-center gap-3">
              {apparence.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={apparence.logoUrl}
                  alt={t.logoActuel(nom)}
                  className="h-14 w-14 rounded-md border border-line object-contain p-1"
                />
              ) : null}
              <label
                htmlFor={logoId}
                className="flex min-h-11 cursor-pointer items-center rounded-control border border-dashed border-line px-4 text-sm font-medium hover:bg-surface-2"
              >
                {envoiLogo ? t.envoiLogo : t.choisirLogo}
              </label>
              <input
                id={logoId}
                type="file"
                accept="image/png,image/svg+xml"
                className="sr-only"
                aria-describedby={`${logoId}-aide`}
                onChange={(event) => {
                  void deposer(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {apparence.logoUrl ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void envoyer('/api/apparence/logo', 'DELETE', undefined, t.erreur).then(() => {
                      router.refresh();
                    })
                  }
                >
                  {t.retirerLogo}
                </Button>
              ) : null}
            </div>
            <p id={`${logoId}-aide`} className="text-xs text-muted">
              {t.aideLogo}
            </p>
            <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
              {erreurLogo}
            </p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t.couleur}</legend>
            <div role="radiogroup" aria-labelledby={nuancierId} className="flex flex-wrap gap-2">
              <span id={nuancierId} className="sr-only">
                {t.nuancier}
              </span>
              {NUANCES.map((nuance) => (
                <button
                  key={nuance}
                  type="button"
                  role="radio"
                  aria-checked={couleur.toUpperCase() === nuance}
                  aria-label={t.nuances[nuance]}
                  onClick={() => {
                    setCouleur(nuance);
                  }}
                  className={cn(
                    'size-11 rounded-full border-[3px] md:size-10',
                    couleur.toUpperCase() === nuance
                      ? 'border-surface ring-2 ring-fg'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: nuance }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${couleurId}-palette`}>{t.personnalisee}</Label>
                <input
                  id={`${couleurId}-palette`}
                  type="color"
                  value={apercu}
                  onChange={(event) => {
                    setCouleur(event.target.value.toUpperCase());
                  }}
                  className="h-11 w-16 cursor-pointer rounded-control border border-line bg-surface md:h-10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={couleurId}>{t.codeCouleur}</Label>
                <Input
                  id={couleurId}
                  value={couleur}
                  onChange={(event) => {
                    setCouleur(event.target.value);
                  }}
                  maxLength={7}
                  className="w-36 font-mono"
                  aria-invalid={erreurs.details.some((d) => d.startsWith('couleur')) || undefined}
                />
              </div>
            </div>
            {proposition ? (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => {
                  setCouleur(proposition);
                  setProposition(null);
                  setErreurs(SANS_ERREUR);
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full"
                  style={{ backgroundColor: proposition }}
                />
                {t.utiliser(proposition)}
              </Button>
            ) : null}
          </fieldset>

          <MessageErreur erreurs={erreurs} champs={['nomAffichage']} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={envoi}>
              {envoi ? t.enregistrement : t.enregistrer}
            </Button>
            {apparence.couleur ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setCouleur(COULEUR_SCOLALY);
                  void enregistrer({ couleur: null });
                }}
              >
                {t.couleurScolaly}
              </Button>
            ) : null}
            <span role="status" className="text-sm text-ok">
              {enregistre ? t.enregistre : ''}
            </span>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">{t.apercuApplication}</h2>
          <div className="flex items-center justify-between gap-3 rounded-control border border-line p-3">
            <span className="flex min-w-0 items-center gap-2">
              {apparence.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apparence.logoUrl} alt="" className="size-8 object-contain" />
              ) : null}
              <span className="truncate text-sm font-semibold">{nom || nomEcole}</span>
            </span>
            <span
              className="rounded-control px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: apercu }}
            >
              {t.emarger}
            </span>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">{t.apercuEmail}</h2>
          <div className="overflow-hidden rounded-control border border-line">
            <div
              className="px-4 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: apercu }}
            >
              {nom || nomEcole}
            </div>
            <div className="flex flex-col gap-3 p-4 text-sm">
              <p>{t.certificat}</p>
              <span
                className="self-start rounded-control px-4 py-2 font-semibold text-white"
                style={{ backgroundColor: apercu }}
              >
                {t.telecharger}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
