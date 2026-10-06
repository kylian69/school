'use client';

import {
  PERMISSION_CODES,
  PERMISSIONS,
  type Permission,
  type RoleDetail,
} from '@scolaly/contracts';
import { Badge, Button, Card, cn, Dialog, DialogContent, Input, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { fr } from '@/i18n/fr';

const t = fr.roles;

/** Permissions regroupées par ressource (RG-01-14 : ressource × action). */
const GROUPES = PERMISSION_CODES.reduce<Map<string, Permission[]>>((groupes, permission) => {
  const ressource = permission.split(':')[0] ?? permission;
  groupes.set(ressource, [...(groupes.get(ressource) ?? []), permission]);
  return groupes;
}, new Map());

async function envoyer(url: string, method: 'POST' | 'PATCH' | 'DELETE', corps?: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: corps ? { 'content-type': 'application/json' } : {},
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    if (response.ok) return { ok: true as const, body };
    return {
      ok: false as const,
      erreur: typeof body?.message === 'string' ? body.message : t.erreur,
    };
  } catch {
    return { ok: false as const, erreur: fr.connexion.erreurs.reseau };
  }
}

const memes = (a: readonly string[], b: ReadonlySet<string>) =>
  a.length === b.size && a.every((p) => b.has(p));

export function RolesEditeur({
  roles,
  modifiable,
}: {
  roles: readonly RoleDetail[];
  /** Permission « roles:gerer » : sinon, consultation seule. */
  modifiable: boolean;
}) {
  const router = useRouter();
  const [selectionId, setSelectionId] = useState(roles[0]?.id ?? '');
  const role = roles.find((r) => r.id === selectionId) ?? roles[0];
  const [brouillon, setBrouillon] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [creation, setCreation] = useState<'vierge' | 'copie' | null>(null);
  const [suppression, setSuppression] = useState(false);

  if (!role) return null;
  const editable = modifiable && !role.verrouille;
  const modifie = !memes(role.permissions, brouillon);

  const choisir = (suivant: RoleDetail) => {
    setSelectionId(suivant.id);
    setBrouillon(new Set(suivant.permissions));
    setErreur(null);
  };

  async function enregistrer() {
    if (!role) return;
    setEnvoi(true);
    const resultat = await envoyer(`/api/roles/${role.id}`, 'PATCH', {
      permissions: PERMISSION_CODES.filter((p) => brouillon.has(p)),
    });
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.erreur);
      return;
    }
    setErreur(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {modifiable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setCreation('copie');
            }}
          >
            {t.dupliquer}
          </Button>
          <Button
            onClick={() => {
              setCreation('vierge');
            }}
          >
            {t.creer}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t.lectureSeule}</p>
      )}

      {modifie ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-warn-soft px-4 py-3 text-sm">
          <span role="status">{t.modifications(role.libelle, role.personnes)}</span>
          <span className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setBrouillon(new Set(role.permissions));
                setErreur(null);
              }}
            >
              {t.annuler}
            </Button>
            <Button disabled={envoi} onClick={() => void enregistrer()}>
              {envoi ? t.enregistrement : t.enregistrer}
            </Button>
          </span>
        </div>
      ) : null}
      <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
        {erreur}
      </p>

      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="p-2">
          <h2 className="sr-only">{t.liste}</h2>
          <ul className="flex flex-col gap-0.5">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === role.id ? 'true' : undefined}
                  onClick={() => {
                    choisir(r);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left',
                    r.id === role.id ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{r.libelle}</span>
                    {r.description ? (
                      <span className="truncate text-xs text-muted">{r.description}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{t.personnes(r.personnes)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{role.libelle}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge>{role.parDefaut ? t.parDefaut : t.personnalise}</Badge>
              {role.doubleAuthentificationRequise ? (
                <Badge>{t.doubleAuthentification}</Badge>
              ) : null}
              <Badge>{t.personnes(role.personnes)}</Badge>
            </div>
            <p className="text-sm text-muted">{role.verrouille ? t.verrouille : t.aide}</p>
          </div>

          <div className="flex flex-col gap-4">
            {[...GROUPES].map(([ressource, permissions]) => (
              <fieldset key={ressource} className="flex flex-col gap-1.5">
                <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                  {t.ressources[ressource] ?? ressource}
                </legend>
                {permissions.map((permission) => (
                  <label
                    key={permission}
                    className="flex min-h-11 items-center gap-3 rounded-control px-2 text-sm hover:bg-surface-2 md:min-h-9"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={brouillon.has(permission)}
                      disabled={!editable}
                      onChange={(event) => {
                        const suivant = new Set(brouillon);
                        if (event.target.checked) suivant.add(permission);
                        else suivant.delete(permission);
                        setBrouillon(suivant);
                      }}
                    />
                    {PERMISSIONS[permission]}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>

          {modifiable && !role.parDefaut ? (
            <Button
              variant="danger"
              className="self-start"
              onClick={() => {
                setErreur(null);
                setSuppression(true);
              }}
            >
              {t.supprimer}
            </Button>
          ) : null}
        </Card>
      </div>

      <CreationRole
        mode={creation}
        source={role}
        onFermer={() => {
          setCreation(null);
        }}
        onCree={(cree) => {
          setCreation(null);
          setSelectionId(cree.id);
          setBrouillon(new Set(cree.permissions));
          router.refresh();
        }}
      />

      <Dialog open={suppression} onOpenChange={setSuppression}>
        <DialogContent title={t.supprimer}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{t.confirmerSuppression(role.libelle)}</p>
            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
              {erreur}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSuppression(false);
                }}
              >
                {t.annuler}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void envoyer(`/api/roles/${role.id}`, 'DELETE').then((resultat) => {
                    if (!resultat.ok) {
                      setErreur(resultat.erreur);
                      return;
                    }
                    setSuppression(false);
                    const suivant = roles.find((r) => r.id !== role.id);
                    if (suivant) choisir(suivant);
                    router.refresh();
                  });
                }}
              >
                {t.supprimerDefinitivement}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Création d'un rôle personnalisé, vierge ou copie du rôle affiché (US-01-10, RG-01-15). */
function CreationRole({
  mode,
  source,
  onFermer,
  onCree,
}: {
  mode: 'vierge' | 'copie' | null;
  source: RoleDetail;
  onFermer: () => void;
  onCree: (role: RoleDetail) => void;
}) {
  const nomId = useId();
  const descriptionId = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  const copie = mode === 'copie';

  async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = data.get('description');
    const resultat = await envoyer('/api/roles', 'POST', {
      libelle: data.get('libelle'),
      ...(typeof description === 'string' && description.trim() ? { description } : {}),
      ...(copie ? { sourceId: source.id } : {}),
      doubleAuthentificationRequise: data.get('doubleAuthentification') === 'on',
    });
    if (!resultat.ok) {
      setErreur(resultat.erreur);
      return;
    }
    setErreur(null);
    onCree(resultat.body as RoleDetail);
  }

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) {
          setErreur(null);
          onFermer();
        }
      }}
    >
      <DialogContent title={copie ? t.dupliquerTitre(source.libelle) : t.nouveauTitre}>
        <form
          key={`${mode ?? ''}-${source.id}`}
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nomId}>{t.nom}</Label>
            <Input
              id={nomId}
              name="libelle"
              required
              minLength={2}
              maxLength={80}
              defaultValue={copie ? t.copie(source.libelle) : ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={descriptionId}>{t.description}</Label>
            <Input id={descriptionId} name="description" maxLength={200} />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="doubleAuthentification"
              className="size-4 accent-[var(--accent)]"
              defaultChecked={copie && source.doubleAuthentificationRequise}
              disabled={copie && source.doubleAuthentificationRequise}
            />
            {t.exigerDoubleAuthentification}
          </label>
          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-bad">
            {erreur}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFermer}>
              {t.annuler}
            </Button>
            <Button type="submit">{t.confirmer}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
