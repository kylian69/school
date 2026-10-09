import { ListePromotions } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { ImportEdt } from './import-edt';

const t = fr.importEdt;
export const metadata: Metadata = { title: t.titre };

/** E-04-03 · Import d'EDT (US-04-04, US-04-05 ; RG-04-08 à RG-04-12). */
export default async function ImportEdtPage() {
  const contexte = await getContexte();
  if (
    !contexte?.modules.includes('emplois-du-temps') ||
    !contexte.permissions.includes('edt:gerer')
  )
    notFound();
  const { data: liste } = await apiGet('/api/promotions', ListePromotions);
  const promotions = liste?.promotions ?? [];
  const etablissements = [
    ...new Map(promotions.map((p) => [p.etablissement.id, p.etablissement])).values(),
  ];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
        <p className="text-sm text-muted">{t.aide}</p>
        <Link
          href="/emploi-du-temps"
          className="self-start text-sm text-accent underline underline-offset-4"
        >
          {t.retour}
        </Link>
      </div>
      {!liste ? (
        <Card>
          <p role="alert" className="text-sm">
            {fr.edt.indisponible}
          </p>
        </Card>
      ) : etablissements.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{fr.edt.sansPromotion}</p>
        </Card>
      ) : (
        <ImportEdt
          etablissements={etablissements}
          promotions={promotions.map((p) => ({
            id: p.id,
            libelle: p.libelle,
            etablissementId: p.etablissement.id,
          }))}
        />
      )}
    </>
  );
}
