import { MesEnseignements } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';

const t = fr.mesEnseignements;
const typeH = fr.referentiel.maquette.typesHeures;
const TYPES = ['cm', 'td', 'tp', 'projet', 'elearning'] as const;
export const metadata: Metadata = { title: t.titre };

const nb = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

/** E-02-08 · Mes enseignements : modules, groupes et heures prévues (US-02-11). */
export default async function MesEnseignementsPage() {
  const { data } = await apiGet('/api/moi/enseignements', MesEnseignements);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        {data && data.enseignements.length > 0 ? (
          <p className="text-sm text-muted">{t.total(nb(data.totalHeures))}</p>
        ) : null}
      </div>
      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : data.enseignements.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.enseignements.map((e) => (
            <li key={e.affectationId}>
              <Card className="flex h-full flex-col gap-2">
                <h2 className="font-semibold">{`${e.module.code} · ${e.module.intitule}`}</h2>
                <p className="text-sm text-muted">{`${e.promotion.libelle} · ${e.groupes.join(', ') || t.touteLaPromotion}`}</p>
                <p className="text-sm">
                  {TYPES.filter((x) => e.heures[x] > 0)
                    .map((x) => `${typeH[x]} ${t.heures(nb(e.heures[x]))}`)
                    .join(' · ')}
                </p>
                <p className="mt-auto text-xs text-muted">{t.realisees}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
