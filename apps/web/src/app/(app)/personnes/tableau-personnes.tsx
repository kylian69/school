'use client';

import type { PersonneResume, ResultatActions } from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { envoyer } from '@/lib/requete';

const t = fr.personnes;
const TONS = { cree: 'neutral', invite: 'warn', actif: 'ok', desactive: 'bad' } as const;

type Action = 'inviter' | 'desactiver' | 'reactiver';

/** Tableau des personnes avec sélection et actions en masse (E-01-04 ; US-01-06, RG-01-21). */
export function TableauPersonnes({
  personnes,
  filtres,
  droits,
}: {
  personnes: readonly PersonneResume[];
  /** Paramètres de recherche de la page, repris par l'export. */
  filtres: string;
  droits: { inviter: boolean; desactiver: boolean; exporter: boolean };
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [resultat, setResultat] = useState<ResultatActions | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const selectionnable = droits.inviter || droits.desactiver;
  const toute = personnes.length > 0 && personnes.every((p) => selection.has(p.id));

  async function agir(action: Action) {
    setEnvoi(true);
    const reponse = await envoyer(
      '/api/personnes/actions',
      'POST',
      { action, personneIds: [...selection] },
      t.erreur,
    );
    setEnvoi(false);
    if (!reponse.ok) {
      setMessage(reponse.erreur);
      setResultat(null);
      return;
    }
    setMessage(null);
    setResultat(reponse.body as ResultatActions);
    setSelection(new Set());
    router.refresh();
  }

  async function exporter() {
    setEnvoi(true);
    try {
      const reponse = await fetch(`/api/personnes/export?${filtres}`);
      if (reponse.status === 200) {
        const lien = URL.createObjectURL(await reponse.blob());
        const a = document.createElement('a');
        a.href = lien;
        a.download = 'personnes.csv';
        a.click();
        URL.revokeObjectURL(lien);
        setMessage(null);
      } else {
        const corps = (await reponse.json().catch(() => null)) as { message?: string } | null;
        setMessage(corps?.message ?? t.erreur);
      }
    } catch {
      setMessage(fr.connexion.erreurs.reseau);
    }
    setEnvoi(false);
  }

  const basculer = (id: string) => {
    const suivante = new Set(selection);
    if (suivante.has(id)) suivante.delete(id);
    else suivante.add(id);
    setSelection(suivante);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {selectionnable && selection.size > 0 ? (
          <>
            <span className="text-sm font-semibold">{t.selection.resume(selection.size)}</span>
            {droits.inviter ? (
              <Button variant="secondary" disabled={envoi} onClick={() => void agir('inviter')}>
                {t.selection.inviter}
              </Button>
            ) : null}
            {droits.desactiver ? (
              <>
                <Button variant="ghost" disabled={envoi} onClick={() => void agir('desactiver')}>
                  {t.selection.desactiver}
                </Button>
                <Button variant="ghost" disabled={envoi} onClick={() => void agir('reactiver')}>
                  {t.selection.reactiver}
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {droits.exporter ? (
          <Button
            variant="secondary"
            className="ml-auto"
            disabled={envoi}
            onClick={() => void exporter()}
          >
            {envoi ? t.exportEnCours : t.exporter}
          </Button>
        ) : null}
      </div>
      <div role="status" className="text-sm empty:hidden">
        {message}
        {resultat ? (
          <>
            <p className="text-ok">{t.selection.reussies(resultat.reussies)}</p>
            {resultat.echecs.length > 0 ? (
              <div>
                <p>{t.selection.echecs}</p>
                <ul className="list-disc pl-5">
                  {resultat.echecs.map((e) => (
                    <li key={e.personneId}>
                      {e.nom} : {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <Card className="p-0">
        {personnes.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.aucune}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  {selectionnable ? (
                    <th scope="col" className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={t.selection.tout}
                        checked={toute}
                        onChange={() => {
                          setSelection(toute ? new Set() : new Set(personnes.map((p) => p.id)));
                        }}
                        className="size-4"
                      />
                    </th>
                  ) : null}
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colonnes.nom}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colonnes.email}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colonnes.roles}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colonnes.compte}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {personnes.map((p) => {
                  const nom = `${p.nomUsage ?? p.nom} ${p.prenom}`;
                  return (
                    <tr key={p.id}>
                      {selectionnable ? (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={t.selection.ligne(nom)}
                            checked={selection.has(p.id)}
                            onChange={() => {
                              basculer(p.id);
                            }}
                            className="size-4"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <Link href={`/personnes/${p.id}`} className="font-semibold hover:underline">
                          {nom}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.email}</td>
                      <td className="px-4 py-3">{p.roles.join(', ') || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={TONS[p.compteEtat]}>{t.etats[p.compteEtat]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
