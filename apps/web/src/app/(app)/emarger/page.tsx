import { SeanceProche } from '@scolaly/contracts';
import type { Metadata } from 'next';
import { z } from 'zod';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { EcranEmarger } from './ecran-emarger';

const t = fr.emargement;
export const metadata: Metadata = { title: t.emarger };

/** US-06-02 · Émargement de l'apprenant : scan du QR ou code à 6 chiffres. */
export default async function EmargerPage() {
  const { data } = await apiGet('/api/moi/seances', z.array(SeanceProche));
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.emarger}</h1>
        <p className="text-sm text-muted">{t.emargerAide}</p>
      </div>
      <EcranEmarger seances={data ?? []} />
    </>
  );
}
