import { FluxIcal } from '@scolaly/contracts';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { AbonnementAgenda } from './abonnement-agenda';

const t = fr.connexions;
export const metadata: Metadata = { title: t.titre };

/** E-18-07 · Mes connexions, partie agenda : flux iCal personnel (RG-04-15, US-04-09). */
export default async function MesConnexionsPage() {
  const { data: flux } = await apiGet('/api/moi/agenda', FluxIcal);
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      <AbonnementAgenda
        initial={flux ?? { actif: false, regenereLe: null, url: null, regenerationRequise: false }}
      />
    </>
  );
}
