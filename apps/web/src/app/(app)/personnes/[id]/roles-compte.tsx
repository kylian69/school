'use client';

import type {
  AttributionPersonne,
  Etablissement,
  PersonneDetail,
  RoleDetail,
} from '@scolaly/contracts';
import { Badge, Button, Card, Dialog, DialogContent, Label } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';
import { Champ, MessageErreur, SANS_ERREUR, type Erreurs } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { formatDate } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.personnes;
const TONS = { 'en-cours': 'ok', 'a-venir': 'accent', terminee: 'neutral' } as const;

/** Rôles, périmètres et compte d'une personne (US-01-09, RG-01-09, RG-01-11). */
export function RolesCompte({
  personne,
  attributions,
  roles,
  etablissements,
  droits,
}: {
  personne: PersonneDetail;
  attributions: readonly AttributionPersonne[];
  roles: readonly RoleDetail[];
  etablissements: readonly Etablissement[];
  droits: { attribuer: boolean; inviter: boolean; desactiver: boolean };
}) {
  const router = useRouter();
  const roleId = useId();
  const perimetreId = useId();
  const [erreurs, setErreurs] = useState<Erreurs>(SANS_ERREUR);
  const [suppression, setSuppression] = useState(false);
  const nomComplet = `${personne.prenom} ${personne.nomUsage ?? personne.nom}`;

  async function supprimer() {
    const resultat = await envoyer(`/api/personnes/${personne.id}`, 'DELETE', undefined, t.erreur);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      setSuppression(false);
      return;
    }
    router.push('/personnes');
    router.refresh();
  }
  const [message, setMessage] = useState<string | null>(null);

  async function action(url: string, succes: string, corps?: unknown) {
    const resultat = await envoyer(url, 'POST', corps, t.erreur);
    if (!resultat.ok) {
      setErreurs({ message: resultat.erreur, details: resultat.details });
      setMessage(null);
      return false;
    }
    setErreurs(SANS_ERREUR);
    setMessage(succes);
    router.refresh();
    return true;
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const texte = (cle: string) => {
      const valeur = data.get(cle);
      return typeof valeur === 'string' ? valeur : '';
    };
    const perimetre = texte('perimetre') || 'organisation';
    const fin = texte('fin');
    void action(`/api/personnes/${personne.id}/attributions`, t.roles.effet, {
      roleId: data.get('roleId'),
      perimetreType: perimetre.startsWith('etablissement:') ? 'etablissement' : perimetre,
      perimetreId: perimetre.startsWith('etablissement:') ? perimetre.slice(14) : null,
      debut: texte('debut') || undefined,
      fin: fin || null,
    }).then((ok) => {
      if (ok) form.reset();
    });
  }

  const libellePerimetre = (a: AttributionPersonne) =>
    a.perimetreType === 'organisation'
      ? t.roles.ecole
      : a.perimetreType === 'soi'
        ? t.roles.soi
        : t.roles.etablissement(a.perimetreLibelle ?? '—');

  return (
    <div className="grid max-w-3xl gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.roles.titre}</h2>
        {attributions.length === 0 ? (
          <p className="text-sm text-muted">{t.roles.aucun}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {attributions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="flex min-w-0 grow flex-col">
                  <span className="text-sm font-semibold">{a.roleLibelle}</span>
                  <span className="text-xs text-muted">
                    {libellePerimetre(a)} ·{' '}
                    {a.fin
                      ? t.roles.periode(formatDate(a.debut), formatDate(a.fin))
                      : t.roles.depuis(formatDate(a.debut))}
                  </span>
                </div>
                <Badge tone={TONS[a.statut]}>{t.roles.statuts[a.statut]}</Badge>
                {droits.attribuer && a.statut !== 'terminee' ? (
                  <Button
                    variant="ghost"
                    aria-label={t.roles.retirerRole(a.roleLibelle)}
                    onClick={() => void action(`/api/attributions/${a.id}/retrait`, t.roles.effet)}
                  >
                    {t.roles.retirer}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {droits.attribuer ? (
          <form
            className="grid items-end gap-3 border-t border-line pt-4 md:grid-cols-2"
            onSubmit={onSubmit}
          >
            <h3 className="text-sm font-semibold md:col-span-2">{t.roles.attribuer}</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={roleId}>{t.roles.role}</Label>
              <select
                id={roleId}
                name="roleId"
                required
                className="h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={perimetreId}>{t.roles.perimetre}</Label>
              <select
                id={perimetreId}
                name="perimetre"
                className="h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm"
              >
                <option value="organisation">{t.roles.ecole}</option>
                {etablissements.map((e) => (
                  <option key={e.id} value={`etablissement:${e.id}`}>
                    {t.roles.etablissement(e.nom)}
                  </option>
                ))}
                <option value="soi">{t.roles.soi}</option>
              </select>
            </div>
            <Champ nom="debut" label={t.roles.debut} erreurs={erreurs} type="date" />
            <Champ nom="fin" label={t.roles.fin} erreurs={erreurs} type="date" />
            <Button type="submit" className="justify-self-start">
              {t.roles.attribuer}
            </Button>
          </form>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.compte.titre}</h2>
        <p className="text-sm">
          <Badge>{t.etats[personne.compteEtat]}</Badge>
        </p>
        <div className="flex flex-wrap gap-2">
          {droits.inviter &&
          (personne.compteEtat === 'cree' || personne.compteEtat === 'invite') ? (
            <Button
              variant="secondary"
              onClick={() =>
                void action(`/api/comptes/${personne.id}/invitation`, t.compte.invitationEnvoyee)
              }
            >
              {personne.compteEtat === 'cree' ? t.compte.inviter : t.compte.relancer}
            </Button>
          ) : null}
          {droits.desactiver && personne.compteEtat !== 'desactive' ? (
            <Button
              variant="ghost"
              onClick={() =>
                void action(`/api/comptes/${personne.id}/desactivation`, t.compte.desactive)
              }
            >
              {t.compte.desactiver}
            </Button>
          ) : null}
          {droits.desactiver && personne.compteEtat === 'desactive' ? (
            <Button
              variant="secondary"
              onClick={() =>
                void action(`/api/comptes/${personne.id}/reactivation`, t.compte.reactive)
              }
            >
              {t.compte.reactiver}
            </Button>
          ) : null}
          {droits.attribuer && personne.compteEtat === 'actif' ? (
            <Button
              variant="ghost"
              onClick={() =>
                void action(
                  `/api/comptes/${personne.id}/double-authentification/reinitialisation`,
                  t.compte.reinitialise,
                )
              }
            >
              {t.compte.reinitialiser}
            </Button>
          ) : null}
          {droits.inviter &&
          (personne.compteEtat === 'cree' || personne.compteEtat === 'invite') ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSuppression(true);
              }}
            >
              {t.compte.supprimer}
            </Button>
          ) : null}
        </div>
      </Card>
      <Dialog open={suppression} onOpenChange={setSuppression}>
        <DialogContent title={t.compte.supprimer}>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">{t.compte.confirmerSuppression(nomComplet)}</p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSuppression(false);
                }}
              >
                {t.fiche.annuler}
              </Button>
              <Button variant="danger" onClick={() => void supprimer()}>
                {t.compte.supprimer}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <MessageErreur erreurs={erreurs} champs={['debut', 'fin']} />
      <p role="status" className="text-sm text-ok empty:hidden">
        {message}
      </p>
    </div>
  );
}
