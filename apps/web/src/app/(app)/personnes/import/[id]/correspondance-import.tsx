'use client';

import { CHAMPS_IMPORT, type ApercuImport } from '@scolaly/contracts';
import { Badge, Button, Card } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatDateHeure } from '@/lib/format';
import { envoyer } from '@/lib/requete';

const t = fr.imports;

/** Étapes 2 et 3 : correspondance des colonnes, puis aperçu des erreurs ligne par ligne. */
export function CorrespondanceImport({ apercu }: { apercu: ApercuImport }) {
  const router = useRouter();
  const [correspondance, setCorrespondance] = useState(apercu.correspondance);
  const [erreur, setErreur] = useState<string | null>(null);
  const modifiee = apercu.colonnes.some(
    (c) => (correspondance[c] ?? null) !== (apercu.correspondance[c] ?? null),
  );

  async function appliquer() {
    const resultat = await envoyer(
      `/api/imports/${apercu.id}/correspondance`,
      'PUT',
      { correspondance },
      t.echec,
    );
    if (!resultat.ok) {
      setErreur(
        resultat.details[0]?.slice(resultat.details[0].indexOf(' : ') + 3) ?? resultat.erreur,
      );
      return;
    }
    setErreur(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.correspondance}</h2>
        <p className="text-sm text-muted">{t.aideCorrespondance}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {apercu.colonnes.map((colonne) => (
            <label key={colonne} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">{colonne}</span>
              <select
                aria-label={t.champ(colonne)}
                value={correspondance[colonne] ?? ''}
                onChange={(event) => {
                  const valeur = event.target.value;
                  setCorrespondance({
                    ...correspondance,
                    [colonne]: CHAMPS_IMPORT.find((c) => c === valeur) ?? null,
                  });
                }}
                className="h-11 rounded-control border border-line bg-surface px-3 text-base md:h-10 md:text-sm"
              >
                <option value="">{t.ignorer}</option>
                {CHAMPS_IMPORT.map((champ) => (
                  <option key={champ} value={champ}>
                    {t.champs[champ]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p role="alert" aria-live="polite" className="text-sm text-bad empty:hidden">
          {erreur}
        </p>
        {modifiee ? (
          <Button className="self-start" onClick={() => void appliquer()}>
            {t.appliquer}
          </Button>
        ) : null}
        {apercu.champsManquants.length > 0 ? (
          <p className="text-sm text-warn">
            {t.manquants(apercu.champsManquants.map((c) => t.champs[c]).join(', '))}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.apercu}</h2>
        <p className="text-sm">
          {t.totaux(
            apercu.totaux.lignes,
            apercu.totaux.valides,
            apercu.totaux.enErreur,
            apercu.totaux.avecAvertissement,
          )}
        </p>
        {apercu.totaux.existantes > 0 ? (
          <p className="text-sm text-muted">{t.existantes(apercu.totaux.existantes)}</p>
        ) : null}
        <p className="text-xs text-muted">
          {t.rienEcrit} {t.reprise(formatDateHeure(apercu.expireLe))}
        </p>
        {apercu.totaux.enErreur + apercu.totaux.avecAvertissement === 0 ? (
          <p className="text-sm text-ok">{t.aucunProbleme}</p>
        ) : (
          // Zone défilante sur mobile : atteignable au clavier pour faire défiler le tableau.
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.problemes}>
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">{t.problemes}</caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t.ligne}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t.problemes}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {apercu.lignes
                  .filter((l) => l.erreurs.length + l.avertissements.length > 0)
                  .map((l) => (
                    <tr key={l.numero}>
                      <td className="px-3 py-2 align-top tabular-nums">{l.numero}</td>
                      <td className="px-3 py-2">
                        <ul className="flex flex-col gap-1">
                          {l.erreurs.map((p) => (
                            <li key={`e-${p.champ}-${p.message}`} className="flex flex-wrap gap-2">
                              <Badge tone="bad">{t.erreur}</Badge>
                              <span>
                                {t.champs[p.champ]} : {p.message}
                              </span>
                            </li>
                          ))}
                          {l.avertissements.map((p) => (
                            <li key={`a-${p.champ}-${p.message}`} className="flex flex-wrap gap-2">
                              <Badge tone="warn">{t.avertissement}</Badge>
                              <span>
                                {t.champs[p.champ]} : {p.message}
                                {p.valeur ? ` (${t.retenu(p.valeur)})` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
