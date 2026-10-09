import { MesDisponibilites } from '@scolaly/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { SaisieDisponibilites } from './saisie-disponibilites';

const t = fr.disponibilites;
export const metadata: Metadata = { title: t.titre };

/** E-04-07 · Mes disponibilités (RG-04-18, US-04-10) : saisie par l'intervenant connecté. */
export default async function MesDisponibilitesPage() {
  const { status, data } = await apiGet('/api/moi/disponibilites', MesDisponibilites);
  if (status === 403 || status === 404) notFound();
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      <p className="max-w-2xl text-sm text-muted">{t.intro}</p>
      {data ? (
        <SaisieDisponibilites initial={data} />
      ) : (
        <p role="alert" className="text-sm text-bad">
          {t.indisponible}
        </p>
      )}
    </>
  );
}
