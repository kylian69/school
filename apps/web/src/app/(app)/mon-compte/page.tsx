import { PhotoPersonne } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { DepotPhoto } from '@/components/photo/depot-photo';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

const t = fr.photo;
export const metadata: Metadata = { title: t.maPhoto };

/** E-01-11 · Mon compte, partie photo : chacun dépose la sienne, validée par la scolarité. */
export default async function MonComptePage() {
  const [session, { data: photo }] = await Promise.all([
    getSession(),
    apiGet('/api/moi/photo', PhotoPersonne),
  ]);
  const nom = session?.user.name ?? '';
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.maPhoto}</h1>
      <Card className="flex max-w-2xl flex-col gap-4">
        <p className="text-sm text-muted">{t.aide}</p>
        <div className="flex flex-wrap items-start gap-4">
          {photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={t.portrait(nom)}
              width={128}
              height={128}
              className="size-32 rounded-card border border-line object-cover"
            />
          ) : (
            <p className="text-sm text-muted">{t.aucune}</p>
          )}
          <DepotPhoto
            url="/api/moi/photo"
            libelle={photo?.url ? t.remplacer : t.deposer}
            succes={t.deposee}
          />
        </div>
        {photo?.statut === 'en_attente' ? (
          <p className="text-sm text-warn">{t.maPhotoAttente}</p>
        ) : null}
        {photo?.statut === 'refusee' && photo.motif ? (
          <p className="text-sm text-bad">{t.refusee(photo.motif)}</p>
        ) : null}
      </Card>
    </>
  );
}
