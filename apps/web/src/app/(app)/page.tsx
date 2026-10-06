import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: fr.accueil.titre };

export default async function AccueilPage() {
  const session = await getSession();
  const prenom = session?.user.name.split(/\s+/)[0] ?? '';
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
        {fr.accueil.bonjour(prenom)}
      </h1>
      <Card className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-base font-semibold">{fr.accueil.pret}</h2>
        <p className="text-sm text-muted">{fr.accueil.suite}</p>
      </Card>
    </>
  );
}
