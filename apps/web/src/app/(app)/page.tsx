import { Demarrage } from '@scolaly/contracts';
import { Button, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { getSession } from '@/lib/session';
import { AnneauAvancement } from './parametres/demarrage/etapes-demarrage';

export const metadata: Metadata = { title: fr.accueil.titre };

export default async function AccueilPage() {
  const [session, contexte] = await Promise.all([getSession(), getContexte()]);
  const prenom = session?.user.name.split(/\s+/)[0] ?? '';
  // Parcours de première configuration : l'administration retrouve la liste de démarrage
  // (US-01-01) tant qu'elle n'est pas terminée.
  const demarrage = contexte?.permissions.includes('organisation:modifier')
    ? (await apiGet('/api/demarrage', Demarrage)).data
    : null;
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
        {fr.accueil.bonjour(prenom)}
      </h1>
      {demarrage && !demarrage.termine ? (
        <Card className="flex max-w-2xl flex-wrap items-center gap-4">
          <AnneauAvancement avancement={demarrage.avancement} />
          <div className="flex min-w-0 grow flex-col gap-1">
            <h2 className="text-base font-semibold">{fr.demarrage.titre}</h2>
            <p className="text-sm text-muted">{fr.demarrage.carte}</p>
          </div>
          <Button asChild>
            <Link href="/parametres/demarrage">{fr.demarrage.continuer}</Link>
          </Button>
        </Card>
      ) : null}
      {contexte?.ecoleActive ? (
        <Card className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-base font-semibold">{fr.accueil.pret}</h2>
          <p className="text-sm text-muted">{fr.accueil.suite}</p>
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <p className="text-sm text-muted">{fr.accueil.sansEcole}</p>
        </Card>
      )}
    </>
  );
}
